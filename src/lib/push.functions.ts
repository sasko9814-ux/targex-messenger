import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function vapidConfig() {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Public VAPID key for subscribing (null when push isn't configured). */
export const getPushConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null };
});

/**
 * Called by the sender right after inserting a message. Verifies (as the
 * caller, through RLS) that the message exists and was sent by the caller,
 * then pushes to the other member's devices.
 */
export const notifyNewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ messageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const vapid = vapidConfig();
    if (!vapid) return { sent: 0, configured: false };

    const { data: msg, error } = await context.supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error || !msg) throw new Error("Message not found");
    if (msg.sender_id !== context.userId) throw new Error("Forbidden");
    if (Date.now() - new Date(msg.created_at).getTime() > 2 * 60_000) {
      return { sent: 0, configured: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWebPush } = await import("@/lib/webpush");

    const [{ data: members }, { data: sender }] = await Promise.all([
      supabaseAdmin
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", msg.conversation_id)
        .neq("user_id", context.userId),
      supabaseAdmin.from("profiles").select("display_name").eq("id", context.userId).single(),
    ]);
    const recipients = (members ?? []).map((m) => m.user_id);
    if (!recipients.length) return { sent: 0, configured: true };

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", recipients);

    const payload = {
      title: sender?.display_name ?? "TargeX",
      body: msg.body.length > 140 ? msg.body.slice(0, 140) + "…" : msg.body,
      url: `/chats/${msg.conversation_id}`,
      tag: msg.conversation_id,
    };

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          const status = await sendWebPush(s, payload, vapid);
          if (status === 404 || status === 410) stale.push(s.id);
          else if (status >= 200 && status < 300) sent++;
          else console.error("push failed", status);
        } catch (e) {
          console.error("push error", e);
        }
      }),
    );
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", stale);
    return { sent, configured: true };
  });
