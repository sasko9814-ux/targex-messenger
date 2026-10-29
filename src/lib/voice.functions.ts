import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const voiceIceServers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ servers: RTCIceServer[]; relay: boolean }> => {
    const urls = process.env["TURN_URLS"];
    const secret = process.env["TURN_REST_SECRET"];
    const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    if (!urls || !secret) return { servers, relay: false };
    const relayUrls = urls.split(",").map((url) => url.trim());
    if (relayUrls.some((url) => !/^turns?:[^\s]+$/.test(url))) throw new Error("turn_configuration");
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${context.userId}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
    const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));
    servers.push({ urls: relayUrls, username, credential });
    return { servers, relay: true };
  });