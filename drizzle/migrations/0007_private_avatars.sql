ALTER TABLE public.profiles DROP CONSTRAINT avatar_url_fmt;
ALTER TABLE public.profiles ADD CONSTRAINT avatar_url_fmt CHECK (
  avatar_url IS NULL
  OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 500)
  OR avatar_url = id::text || '/' || substring(avatar_url from '[^/]+$') AND avatar_url ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
);

CREATE POLICY "Avatar owners upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(name) ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$');
CREATE POLICY "Avatar owners update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar owners delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatars readable by owner and chat partners" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        AND public.shares_conversation(auth.uid(), ((storage.foldername(name))[1])::uuid))
  ));