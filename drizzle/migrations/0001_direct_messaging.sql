-- Signup race: fall back to a generated username if the requested one collides concurrently
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wanted text := lower(coalesce(NEW.raw_user_meta_data->>'username', ''));
  dname text := btrim(coalesce(NEW.raw_user_meta_data->>'display_name', ''));
  fallback text := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12);
  final_name text;
BEGIN
  IF wanted ~ '^[a-z0-9_]{3,24}$' THEN final_name := wanted; ELSE final_name := fallback; END IF;
  IF char_length(dname) < 1 OR char_length(dname) > 50 THEN dname := final_name; END IF;
  BEGIN
    INSERT INTO public.profiles (id, username, display_name) VALUES (NEW.id, final_name, dname);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (NEW.id, fallback, CASE WHEN dname = final_name THEN fallback ELSE dname END);
  END;
  RETURN NEW;
END $$;

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direct_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)
);
CREATE INDEX messages_conv_created_idx ON public.messages (conversation_id, created_at DESC, id DESC);

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT endpoint_https CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  CONSTRAINT keys_len CHECK (char_length(p256dh) <= 200 AND char_length(auth) <= 100),
  CONSTRAINT ua_len CHECK (user_agent IS NULL OR char_length(user_agent) <= 300)
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.conversations, public.conversation_members, public.messages, public.push_subscriptions TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members
                 WHERE conversation_id = _conversation_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.shares_conversation(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members m1
                 JOIN public.conversation_members m2 ON m1.conversation_id = m2.conversation_id
                 WHERE m1.user_id = _a AND m2.user_id = _b);
$$;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_conversation(uuid, uuid) TO authenticated;

CREATE POLICY "Members read conversations" ON public.conversations
  FOR SELECT TO authenticated USING (public.is_conversation_member(id, auth.uid()));
CREATE POLICY "Members read memberships" ON public.conversation_members
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Members read messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Members send as themselves" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "Users read own push subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users add own push subscriptions" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users remove own push subscriptions" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read chat partners' profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.shares_conversation(auth.uid(), id));

-- Server-controlled timestamps + conversation activity
CREATE OR REPLACE FUNCTION public.messages_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_at := now();
  NEW.body := btrim(NEW.body);
  RETURN NEW;
END $$;
CREATE TRIGGER messages_before_insert BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_before_insert();

CREATE OR REPLACE FUNCTION public.messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.messages_after_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER messages_after_insert AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_after_insert();

-- Start (or reopen) a 1:1 chat by username. Race-safe via unique direct_key.
CREATE OR REPLACE FUNCTION public.start_direct_conversation(_username text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  other uuid;
  k text;
  conv uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT id INTO other FROM public.profiles WHERE lower(username) = lower(btrim(_username));
  IF other IS NULL THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002'; END IF;
  IF other = me THEN RAISE EXCEPTION 'cannot_chat_with_self' USING ERRCODE = '22023'; END IF;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  INSERT INTO public.conversations (direct_key) VALUES (k) ON CONFLICT (direct_key) DO NOTHING;
  SELECT id INTO conv FROM public.conversations WHERE direct_key = k;
  INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (conv, me), (conv, other) ON CONFLICT DO NOTHING;
  RETURN conv;
END $$;
REVOKE EXECUTE ON FUNCTION public.start_direct_conversation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(text) TO authenticated;

-- Conversation list for the caller only
CREATE OR REPLACE FUNCTION public.list_my_conversations()
RETURNS TABLE (
  conversation_id uuid, last_message_at timestamptz,
  peer_id uuid, peer_username text, peer_display_name text, peer_avatar_url text,
  last_body text, last_sender_id uuid
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.last_message_at, p.id, p.username, p.display_name, p.avatar_url, lm.body, lm.sender_id
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  JOIN public.conversation_members om ON om.conversation_id = c.id AND om.user_id <> me.user_id
  JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.sender_id FROM public.messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
  ) lm ON true
  WHERE me.user_id = auth.uid()
  ORDER BY c.last_message_at DESC
  LIMIT 200;
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;