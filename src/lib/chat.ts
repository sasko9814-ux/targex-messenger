import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { messageBodySchema } from "@/lib/validation";
import { attachmentsSchema } from "@/lib/validation";
import type { Attachment } from "@/lib/attachments";

export const PAGE_SIZE = 30;

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachments?: Attachment[];
  edited_at?: string | null;
  deleted_at?: string | null;
};

export const conversationsQuery = () =>
  queryOptions({
    queryKey: ["conversations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_conversations");
      if (error) throw error;
      return data ?? [];
    },
  });

export const peerQuery = (conversationId: string, me: string) =>
  queryOptions({
    queryKey: ["peer", conversationId],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      if (!members?.some((m) => m.user_id === me)) return null; // not a member / not found
      const other = members.find((m) => m.user_id !== me);
      if (!other) return null;
      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", other.user_id)
        .maybeSingle();
      if (pe) throw pe;
      return p;
    },
  });

/** Pages go newest→oldest; each page is ordered newest first. */
export const messagesQuery = (conversationId: string) =>
  infiniteQueryOptions({
    queryKey: ["messages", conversationId],
    initialPageParam: null as null | { created_at: string; id: string },
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, attachments, edited_at, deleted_at",
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) {
        q = q.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        attachments: attachmentsSchema.parse(m.attachments),
      }));
    },
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length < PAGE_SIZE || !tail
        ? undefined
        : { created_at: tail.created_at, id: tail.id };
    },
  });

export async function startConversation(username: string) {
  const { data, error } = await supabase.rpc("start_direct_conversation", { _username: username });
  if (error) throw error;
  return data as string;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  raw: string,
  attachments: Attachment[] = [],
) {
  const body = messageBodySchema.parse(raw);
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
      attachments: attachmentsSchema.parse(attachments),
    })
    .select("id, conversation_id, sender_id, body, created_at, attachments, edited_at, deleted_at")
    .single();
  if (error) throw error;
  return { ...data, attachments: attachmentsSchema.parse(data.attachments) };
}

export async function modifyMessage(id: string, action: { body: string } | { deleted_at: string }) {
  const changes = "body" in action ? { body: messageBodySchema.parse(action.body) } : action;
  const { data, error } = await supabase
    .from("messages")
    .update(changes)
    .eq("id", id)
    .select("id, conversation_id, sender_id, body, created_at, attachments, edited_at, deleted_at")
    .single();
  if (error) throw error;
  return { ...data, attachments: attachmentsSchema.parse(data.attachments) };
}

/** Inserts a message into the newest page if it is not already cached. */
export function mergeMessage(pages: Message[][] | undefined, msg: Message): Message[][] {
  const all = pages ?? [[]];
  if (all.some((p) => p.some((m) => m.id === msg.id)))
    return all.map((p) => p.map((m) => (m.id === msg.id ? msg : m)));
  const [first = [], ...rest] = all;
  const next = [msg, ...first].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
  );
  return [next, ...rest];
}
