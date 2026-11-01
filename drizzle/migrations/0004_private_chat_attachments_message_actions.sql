ALTER TABLE public.messages ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN edited_at timestamptz, ADD COLUMN deleted_at timestamptz;
CREATE OR REPLACE FUNCTION public.valid_chat_file(_name text, _size bigint) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT char_length(_name) BETWEEN 1 AND 255 AND _size BETWEEN 1 AND 52428800 AND lower(_name) ~ '\.(jpg|jpeg|png|webp|mp4|webm|mov|m4v|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|gz|mp3|wav|ogg|json)$' $$;
CREATE OR REPLACE FUNCTION public.validate_message_attachments() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a jsonb; object_size bigint; object_type text;
BEGIN
 IF jsonb_typeof(NEW.attachments)<>'array' OR jsonb_array_length(NEW.attachments)>10 THEN RAISE EXCEPTION 'invalid_attachments'; END IF;
 IF TG_OP='UPDATE' THEN
 NEW.id:=OLD.id; NEW.conversation_id:=OLD.conversation_id; NEW.sender_id:=OLD.sender_id; NEW.created_at:=OLD.created_at;
 IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'message_deleted'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN NEW.deleted_at:=now(); NEW.body:='Повідомлення видалено'; NEW.attachments:='[]'::jsonb; NEW.edited_at:=OLD.edited_at;
 ELSE NEW.attachments:=OLD.attachments; NEW.body:=btrim(NEW.body); NEW.edited_at:=CASE WHEN NEW.body IS DISTINCT FROM OLD.body THEN now() ELSE OLD.edited_at END; END IF;
 ELSE
 NEW.edited_at:=NULL; NEW.deleted_at:=NULL;
 FOR a IN SELECT value FROM jsonb_array_elements(NEW.attachments) LOOP
 IF NOT public.valid_chat_file(a->>'name',(a->>'size')::bigint) OR a->>'path' NOT LIKE NEW.conversation_id::text||'/'||NEW.sender_id::text||'/%' THEN RAISE EXCEPTION 'invalid_attachment'; END IF;
 SELECT (metadata->>'size')::bigint, metadata->>'mimetype' INTO object_size,object_type FROM storage.objects WHERE bucket_id='chat-files' AND name=a->>'path';
 IF object_size IS NULL OR object_size<>(a->>'size')::bigint OR object_type IS DISTINCT FROM a->>'type' THEN RAISE EXCEPTION 'attachment_not_uploaded'; END IF;
 END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER messages_validate_attachments BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.validate_message_attachments();
GRANT UPDATE(body,deleted_at) ON public.messages TO authenticated;
CREATE POLICY "Senders modify own messages" ON public.messages FOR UPDATE TO authenticated USING(sender_id=auth.uid() AND public.is_conversation_member(conversation_id,auth.uid())) WITH CHECK(sender_id=auth.uid() AND public.is_conversation_member(conversation_id,auth.uid()));
CREATE OR REPLACE FUNCTION public.can_read_chat_file(_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.messages m JOIN public.conversation_members cm ON cm.conversation_id=m.conversation_id WHERE cm.user_id=auth.uid() AND m.deleted_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.attachments) a WHERE a->>'path'=_path)) OR (split_part(_path,'/',2)=auth.uid()::text AND EXISTS(SELECT 1 FROM public.conversation_members cm WHERE cm.user_id=auth.uid() AND cm.conversation_id::text=split_part(_path,'/',1))) $$;
CREATE POLICY "Participants upload chat files" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='chat-files' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS(SELECT 1 FROM public.conversation_members cm WHERE cm.user_id=auth.uid() AND cm.conversation_id::text=split_part(name,'/',1)) AND public.valid_chat_file(split_part(name,'/',3),(metadata->>'size')::bigint));
CREATE POLICY "Participants read shared files" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='chat-files' AND public.can_read_chat_file(name));
CREATE POLICY "Owners remove unshared uploads" ON storage.objects FOR DELETE TO authenticated USING(bucket_id='chat-files' AND split_part(name,'/',2)=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.messages m WHERE m.deleted_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.attachments) a WHERE a->>'path'=name)));
REVOKE ALL ON FUNCTION public.valid_chat_file(text,bigint),public.can_read_chat_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_chat_file(text,bigint),public.can_read_chat_file(text) TO authenticated,service_role;