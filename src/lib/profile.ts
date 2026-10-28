import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProfileUpdateInput } from "@/lib/validation";

export const myProfileQuery = (userId: string) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export async function isUsernameAvailable(username: string) {
  const { data, error } = await supabase.rpc("is_username_available", { _username: username });
  if (error) throw error;
  return data === true;
}

export async function updateMyProfile(userId: string, input: ProfileUpdateInput) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      username: input.username,
      display_name: input.displayName,
      bio: input.bio,
      avatar_url: input.avatarUrl,
    })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
