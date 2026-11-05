import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET, isAvatarPath, isOwnAvatarPath, newAvatarPath } from "@/lib/avatar-rules";

/** Resolves a stored avatar value to a displayable URL (signed for private storage paths). */
export function useAvatarSrc(value: string | null | undefined) {
  const path = isAvatarPath(value) ? value : null;
  const q = useQuery({
    queryKey: ["avatar-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!value) return null;
  return path ? (q.data ?? null) : value;
}

/** Uploads the cropped avatar, points the profile at it, then removes the previous own object. */
export async function replaceAvatar(userId: string, blob: Blob, previous: string | null) {
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  const path = newAvatarPath(userId, ext, crypto.randomUUID());
  const up = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "3600" });
  if (up.error) throw new Error("Не вдалося завантажити фото. Спробуйте ще раз");
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", userId)
    .select()
    .single();
  if (error) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw new Error("Не вдалося зберегти фото профілю");
  }
  if (isOwnAvatarPath(userId, previous) && previous !== path)
    await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return data;
}

export async function removeAvatar(userId: string, previous: string | null) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw new Error("Не вдалося видалити фото");
  if (isOwnAvatarPath(userId, previous))
    await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return data;
}
