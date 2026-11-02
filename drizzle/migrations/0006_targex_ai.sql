CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Нова розмова' CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_idx ON public.ai_conversations(user_id, updated_at DESC);
GRANT SELECT, INSERT, DELETE ON public.ai_conversations TO authenticated;
GRANT UPDATE (title, updated_at) ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai conversations select" ON public.ai_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own ai conversations insert" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own ai conversations update" ON public.ai_conversations FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own ai conversations delete" ON public.ai_conversations FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conv_idx ON public.ai_messages(conversation_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai messages select" ON public.ai_messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own ai messages insert" ON public.ai_messages FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "own ai messages delete" ON public.ai_messages FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_idx ON public.ai_usage(user_id, created_at DESC);
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Per-user rate limit: 8 requests/minute, 150/day. Returns false when exceeded.
CREATE OR REPLACE FUNCTION public.consume_ai_quota()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota'), hashtext(uid::text));
  IF (SELECT count(*) FROM ai_usage WHERE user_id = uid AND created_at > now() - interval '1 minute') >= 8
     OR (SELECT count(*) FROM ai_usage WHERE user_id = uid AND created_at > now() - interval '1 day') >= 150 THEN
    RETURN false;
  END IF;
  DELETE FROM ai_usage WHERE user_id = uid AND created_at < now() - interval '2 days';
  INSERT INTO ai_usage(user_id) VALUES (uid);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_ai_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota() TO authenticated;