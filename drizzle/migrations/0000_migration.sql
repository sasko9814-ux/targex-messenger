CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  CONSTRAINT display_name_len CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 50),
  CONSTRAINT bio_len CHECK (bio IS NULL OR char_length(bio) <= 300),
  CONSTRAINT avatar_url_fmt CHECK (avatar_url IS NULL OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 500))
);
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles (lower(username));

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Prevent changing id / created_at via update
CREATE OR REPLACE FUNCTION public.profiles_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.created_at := OLD.created_at;
  NEW.username := lower(NEW.username);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_before_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_before_update();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wanted text := lower(coalesce(NEW.raw_user_meta_data->>'username', ''));
  dname text := btrim(coalesce(NEW.raw_user_meta_data->>'display_name', ''));
  final_name text;
BEGIN
  IF wanted ~ '^[a-z0-9_]{3,24}$' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = wanted) THEN
    final_name := wanted;
  ELSE
    final_name := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12);
  END IF;
  IF char_length(dname) < 1 OR char_length(dname) > 50 THEN
    dname := final_name;
  END IF;
  INSERT INTO public.profiles (id, username, display_name) VALUES (NEW.id, final_name, dname);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Username availability check (reveals only true/false)
CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_username));
$$;
REVOKE EXECUTE ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;