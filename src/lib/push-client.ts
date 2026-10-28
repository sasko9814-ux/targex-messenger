import { supabase } from "@/integrations/supabase/client";
import { b64urlDecode, b64urlEncode } from "@/lib/webpush";
import { getPushConfig } from "@/lib/push.functions";

export type PushState = "unsupported" | "iframe" | "unconfigured" | "denied" | "off" | "on";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration() {
  return navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (window.self !== window.top) return "iframe";
  const { publicKey } = await getPushConfig();
  if (!publicKey) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Must be called from a user gesture (button click). */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await getPushConfig();
  if (!publicKey) return "unconfigured";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlDecode(publicKey) as unknown as BufferSource,
    }));
  const p256dh = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!p256dh || !auth) throw new Error("subscription keys missing");
  // Replace any previous row for this endpoint (endpoint is unique).
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    endpoint: sub.endpoint,
    p256dh: b64urlEncode(new Uint8Array(p256dh)),
    auth: b64urlEncode(new Uint8Array(auth)),
    user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  return "off";
}
