CREATE TABLE public.voice_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES public.conversations(id),
 caller_id uuid NOT NULL REFERENCES public.profiles(id),
 callee_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','rejected','ended','missed','failed')),
 offer jsonb NOT NULL CHECK (offer->>'type' = 'offer' AND length(offer->>'sdp') BETWEEN 1 AND 65536),
 answer jsonb CHECK (answer IS NULL OR (answer->>'type' = 'answer' AND length(answer->>'sdp') BETWEEN 1 AND 65536)),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds'),
 caller_seen_at timestamptz NOT NULL DEFAULT now(),
 callee_seen_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 CHECK (caller_id <> callee_id)
);
GRANT SELECT ON public.voice_calls TO authenticated;
GRANT ALL ON public.voice_calls TO service_role;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read calls" ON public.voice_calls FOR SELECT TO authenticated USING (auth.uid() IN (caller_id,callee_id));
CREATE INDEX voice_calls_participants ON public.voice_calls(caller_id,callee_id,status);
CREATE TABLE public.voice_call_candidates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 call_id uuid NOT NULL REFERENCES public.voice_calls(id),
 sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
 candidate jsonb NOT NULL CHECK (jsonb_typeof(candidate)='object' AND octet_length(candidate::text) <= 8192),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON public.voice_call_candidates TO authenticated;
GRANT ALL ON public.voice_call_candidates TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.voice_call_candidates_id_seq TO authenticated,service_role;
ALTER TABLE public.voice_call_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read ICE" ON public.voice_call_candidates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.voice_calls c WHERE c.id=call_id AND auth.uid() IN (c.caller_id,c.callee_id)));
CREATE POLICY "Participants send own ICE" ON public.voice_call_candidates FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND EXISTS (SELECT 1 FROM public.voice_calls c WHERE c.id=call_id AND auth.uid() IN (c.caller_id,c.callee_id) AND c.status IN ('ringing','accepted') AND c.expires_at > now()));
CREATE INDEX voice_call_candidates_call ON public.voice_call_candidates(call_id,id);
CREATE FUNCTION public.expire_voice_calls() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.voice_calls SET status=CASE WHEN status='ringing' THEN 'missed' ELSE 'failed' END,ended_at=now()
 WHERE auth.uid() IN (caller_id,callee_id) AND status IN ('ringing','accepted') AND (expires_at<=now() OR (status='accepted' AND least(caller_seen_at,callee_seen_at)<now()-interval '60 seconds'));
$$;
REVOKE ALL ON FUNCTION public.expire_voice_calls() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.expire_voice_calls() TO authenticated;
CREATE FUNCTION public.start_voice_call(_conversation_id uuid,_offer jsonb) RETURNS public.voice_calls LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); peer uuid; result public.voice_calls;
BEGIN
 IF me IS NULL OR NOT public.is_conversation_member(_conversation_id,me) THEN RAISE EXCEPTION 'call_forbidden' USING ERRCODE='42501'; END IF;
 SELECT user_id INTO peer FROM public.conversation_members WHERE conversation_id=_conversation_id AND user_id<>me;
 IF peer IS NULL OR (SELECT count(*) FROM public.conversation_members WHERE conversation_id=_conversation_id)<>2 THEN RAISE EXCEPTION 'invalid_conversation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(least(me::text,peer::text),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(greatest(me::text,peer::text),0));
 UPDATE public.voice_calls SET status=CASE WHEN status='ringing' THEN 'missed' ELSE 'failed' END,ended_at=now() WHERE (caller_id IN (me,peer) OR callee_id IN (me,peer)) AND status IN ('ringing','accepted') AND (expires_at<=now() OR (status='accepted' AND least(caller_seen_at,callee_seen_at)<now()-interval '60 seconds'));
 IF EXISTS (SELECT 1 FROM public.voice_calls WHERE (caller_id IN (me,peer) OR callee_id IN (me,peer)) AND status IN ('ringing','accepted')) THEN RAISE EXCEPTION 'call_busy'; END IF;
 INSERT INTO public.voice_calls(conversation_id,caller_id,callee_id,offer) VALUES (_conversation_id,me,peer,_offer) RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.start_voice_call(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_voice_call(uuid,jsonb) TO authenticated;
CREATE FUNCTION public.update_voice_call(_call_id uuid,_action text,_answer jsonb DEFAULT NULL) RETURNS public.voice_calls LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.voice_calls; me uuid:=auth.uid();
BEGIN
 SELECT * INTO c FROM public.voice_calls WHERE id=_call_id FOR UPDATE;
 IF me IS NULL OR c.id IS NULL OR me NOT IN (c.caller_id,c.callee_id) THEN RAISE EXCEPTION 'call_forbidden' USING ERRCODE='42501'; END IF;
 IF c.status NOT IN ('ringing','accepted') THEN RETURN c; END IF;
 IF c.expires_at<=now() OR (c.status='accepted' AND least(c.caller_seen_at,c.callee_seen_at)<now()-interval '60 seconds') THEN
 UPDATE public.voice_calls SET status=CASE WHEN status='ringing' THEN 'missed' ELSE 'failed' END,ended_at=now() WHERE id=c.id RETURNING * INTO c; RETURN c;
 END IF;
 IF _action='accept' THEN
 IF me<>c.callee_id OR c.status<>'ringing' OR _answer IS NULL THEN RAISE EXCEPTION 'invalid_call_transition'; END IF;
 UPDATE public.voice_calls SET status='accepted',answer=_answer,expires_at=now()+interval '60 seconds',caller_seen_at=now(),callee_seen_at=now() WHERE id=c.id RETURNING * INTO c;
 ELSIF _action='heartbeat' THEN
 UPDATE public.voice_calls SET caller_seen_at=CASE WHEN me=caller_id THEN now() ELSE caller_seen_at END,callee_seen_at=CASE WHEN me=callee_id THEN now() ELSE callee_seen_at END,expires_at=CASE WHEN status='accepted' THEN now()+interval '60 seconds' ELSE expires_at END WHERE id=c.id RETURNING * INTO c;
 ELSIF _action IN ('reject','hangup','fail') THEN
 IF _action='reject' AND (me<>c.callee_id OR c.status<>'ringing') THEN RAISE EXCEPTION 'invalid_call_transition'; END IF;
 UPDATE public.voice_calls SET status=CASE _action WHEN 'reject' THEN 'rejected' WHEN 'fail' THEN 'failed' ELSE 'ended' END,ended_at=now() WHERE id=c.id RETURNING * INTO c;
 ELSE RAISE EXCEPTION 'invalid_call_transition'; END IF;
 RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.update_voice_call(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_voice_call(uuid,text,jsonb) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_calls,public.voice_call_candidates;