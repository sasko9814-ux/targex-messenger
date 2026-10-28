-- TargeX RLS / authorization checks.
-- Runs entirely inside one transaction and ALWAYS aborts at the end with a
-- RESULTS exception, so no test users, chats or messages are persisted.
-- Expected: every line in the RESULTS message starts with "PASS".
DO $$
DECLARE
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  ua text := 'rlsa_' || substr(md5(random()::text), 1, 8);
  ub text := 'rlsb_' || substr(md5(random()::text), 1, 8);
  conv uuid; conv2 uuid; n int; out text := ''; uname text;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ua || '@test.invalid', jsonb_build_object('username', ua, 'display_name', 'A'), now(), now()),
    (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ub || '@test.invalid', jsonb_build_object('username', ub, 'display_name', 'B'), now(), now()),
    (c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c' || ua || '@test.invalid', '{}'::jsonb, now(), now()),
    (d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd' || ua || '@test.invalid', jsonb_build_object('username', upper(ua)), now(), now());

  SELECT count(*) INTO n FROM public.profiles WHERE id IN (a, b, c, d);
  out := out || CASE WHEN n = 4 THEN 'PASS' ELSE 'FAIL' END || ' signup trigger creates profiles (' || n || ')' || E'\n';
  SELECT username INTO uname FROM public.profiles WHERE id = d;
  out := out || CASE WHEN uname LIKE 'user_%' THEN 'PASS' ELSE 'FAIL' END || ' duplicate username (other case) falls back: ' || uname || E'\n';

  -- ===== as A =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  conv := public.start_direct_conversation(ub);
  conv2 := public.start_direct_conversation(upper(ub));
  out := out || CASE WHEN conv = conv2 THEN 'PASS' ELSE 'FAIL' END || ' starting chat twice returns same conversation' || E'\n';

  BEGIN PERFORM public.start_direct_conversation(ua); out := out || 'FAIL chat with self allowed' || E'\n';
  EXCEPTION WHEN OTHERS THEN out := out || 'PASS chat with self rejected' || E'\n'; END;

  INSERT INTO public.messages (conversation_id, body) VALUES (conv, '  привіт  ');
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = conv AND sender_id = a AND body = 'привіт';
  out := out || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' member sends as self (sender defaulted, body trimmed)' || E'\n';

  BEGIN INSERT INTO public.messages (conversation_id, sender_id, body) VALUES (conv, b, 'spoof');
    out := out || 'FAIL spoofed sender_id accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN out := out || 'PASS spoofed sender_id rejected' || E'\n'; END;

  BEGIN INSERT INTO public.messages (conversation_id, body) VALUES (conv, '   ');
    out := out || 'FAIL blank message accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN out := out || 'PASS blank message rejected' || E'\n'; END;

  BEGIN INSERT INTO public.messages (conversation_id, body) VALUES (conv, repeat('x', 4001));
    out := out || 'FAIL 4001-char message accepted' || E'\n';
  EXCEPTION WHEN OTHERS THEN out := out || 'PASS 4001-char message rejected' || E'\n'; END;

  BEGIN UPDATE public.messages SET body = 'edited' WHERE conversation_id = conv;
    out := out || 'FAIL message edit allowed' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS message edit denied' || E'\n'; END;

  BEGIN DELETE FROM public.messages WHERE conversation_id = conv;
    out := out || 'FAIL message delete allowed' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS message delete denied' || E'\n'; END;

  BEGIN INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (conv, c);
    out := out || 'FAIL member can add third user' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS membership insert denied' || E'\n'; END;

  BEGIN DELETE FROM public.conversation_members WHERE conversation_id = conv;
    out := out || 'FAIL membership delete allowed' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS membership delete denied' || E'\n'; END;

  SELECT count(*) INTO n FROM public.profiles WHERE id = b;
  out := out || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' chat partner profile visible' || E'\n';
  SELECT count(*) INTO n FROM public.profiles WHERE id = c;
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' unrelated profile hidden' || E'\n';
  UPDATE public.profiles SET display_name = 'hacked' WHERE id = b;
  GET DIAGNOSTICS n = ROW_COUNT;
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' cannot update partner profile' || E'\n';
  SELECT count(*) INTO n FROM public.list_my_conversations();
  out := out || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' conversation list shows own chat' || E'\n';
  EXECUTE 'RESET ROLE';

  -- ===== as B (recipient) =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = conv;
  out := out || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' recipient reads message' || E'\n';
  EXECUTE 'RESET ROLE';

  -- ===== as C (non-member) =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.messages WHERE conversation_id = conv;
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' non-member cannot read messages' || E'\n';
  SELECT count(*) INTO n FROM public.conversations WHERE id = conv;
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' non-member cannot see conversation' || E'\n';
  SELECT count(*) INTO n FROM public.conversation_members WHERE conversation_id = conv;
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' non-member cannot see members' || E'\n';
  BEGIN INSERT INTO public.messages (conversation_id, body) VALUES (conv, 'intrude');
    out := out || 'FAIL non-member can post' || E'\n';
  EXCEPTION WHEN OTHERS THEN out := out || 'PASS non-member cannot post' || E'\n'; END;
  SELECT count(*) INTO n FROM public.profiles WHERE id IN (a, b);
  out := out || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' non-member cannot read others'' profiles' || E'\n';
  EXECUTE 'RESET ROLE';

  -- ===== anon =====
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN PERFORM count(*) FROM public.messages; out := out || 'FAIL anon can query messages' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS anon denied messages' || E'\n'; END;
  BEGIN PERFORM public.start_direct_conversation(ub); out := out || 'FAIL anon can start chat' || E'\n';
  EXCEPTION WHEN insufficient_privilege THEN out := out || 'PASS anon cannot start chat' || E'\n'; END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION E'RESULTS (rolled back):\n%', out;
END $$;
