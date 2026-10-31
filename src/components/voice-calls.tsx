import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  VoiceMedia,
  VoiceIceQueue,
  canApplyCall,
  callExpired,
  isLiveCall,
  HEARTBEAT_MS,
  type VoiceCall,
} from "@/lib/voice";
import { voiceIceServers } from "@/lib/voice.functions";
import { callCandidateSchema, callDescriptionSchema } from "@/lib/validation";

const VoiceContext = createContext<{
  start: (conversation: string, name: string) => Promise<void>;
  busy: boolean;
}>({ start: async () => {}, busy: false });
export const useVoiceCalls = () => useContext(VoiceContext);
const statuses: Record<string, string> = {
  rejected: "Дзвінок відхилено",
  ended: "Дзвінок завершено",
  missed: "Пропущений дзвінок",
  failed: "З’єднання втрачено",
};

export function VoiceCallsProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const getServers = useServerFn(voiceIceServers);
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("");
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [working, setWorking] = useState(false);
  const current = useRef<VoiceCall | null>(null);
  const media = useRef<VoiceMedia | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const seenIce = useRef(new Set<number>());
  const iceQueue = useRef<VoiceIceQueue | null>(null);
  const processing = useRef(Promise.resolve());

  function cleanup() {
    generation.current++;
    media.current?.dispose();
    media.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    current.current = null;
    iceQueue.current?.dispose();
    iceQueue.current = null;
    seenIce.current.clear();
    locked.current = false;
    setCall(null);
    setBusy(false);
    setWorking(false);
    setMuted(false);
    setAudioBlocked(false);
  }

  async function action(id: string, value: string, answer?: RTCSessionDescriptionInit) {
    const { data, error } = await supabase.rpc("update_voice_call", {
      _call_id: id,
      _action: value,
      ...(answer ? { _answer: callDescriptionSchema.parse(answer) } : {}),
    });
    if (error) throw error;
    if (!data) throw new Error("missing_call");
    return data;
  }

  async function end(value = "hangup") {
    const active = current.current;
    cleanup();
    if (active) {
      try {
        await action(active.id, value);
      } catch {
        toast.error("Не вдалося повідомити співрозмовника. Дзвінок завершиться за тайм-аутом.");
      }
    }
  }

  async function fail(error: unknown) {
    if (error instanceof Error && error.message === "call_cancelled") return;
    const message = error instanceof Error ? error.message : String(error);
    toast.error(
      message.includes("call_busy")
        ? "Користувач уже розмовляє"
        : message.includes("NotAllowed") || message.includes("Permission")
          ? "Надайте доступ до мікрофона"
          : "Не вдалося з’єднати дзвінок. Перевірте мікрофон і мережу.",
    );
    await end("fail");
  }

  async function sendIce(candidate: RTCIceCandidateInit, id: string) {
    const { error } = await supabase.from("voice_call_candidates").insert({
      call_id: id,
      ...(userId ? { sender_id: userId } : {}),
      candidate: callCandidateSchema.parse(candidate) as Json,
    });
    if (error && current.current?.id === id) throw error;
  }

  async function openMedia() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw new Error("unsupported_browser");
    const session = new VoiceMedia();
    const version = generation.current;
    media.current = session;
    const queue = new VoiceIceQueue(sendIce, (error) => {
      if (version === generation.current && !session.disposed) void fail(error);
    });
    iceQueue.current = queue;
    if (current.current) queue.bind(current.current.id);
    const config = await getServers();
    if (session.disposed) throw new Error("call_cancelled");
    const peer = await session.open(config.servers);
    peer.onicecandidate = (event) => {
      if (!event.candidate || session.disposed) return;
      const candidate = event.candidate.toJSON();
      queue.push(candidate);
    };
    peer.ontrack = (event) => {
      if (session.disposed) return;
      session.remote.addTrack(event.track);
      if (audio.current) {
        audio.current.srcObject = session.remote;
        void audio.current.play().catch(() => setAudioBlocked(true));
      }
    };
    peer.onconnectionstatechange = () => {
      if (session.disposed) return;
      if (peer.connectionState === "connected") setPhase("Розмова");
      if (peer.connectionState === "disconnected") setPhase("Відновлення з’єднання…");
      if (peer.connectionState === "failed") void fail(new Error("connection_failed"));
    };
    if (!config.relay) toast("Ретранслятор не налаштовано: деякі мережі можуть блокувати дзвінки.");
    return { session, peer, queue };
  }

  async function syncCandidates(active: VoiceCall) {
    const session = media.current;
    if (!session) return;
    const { data, error } = await supabase
      .from("voice_call_candidates")
      .select("id,candidate,sender_id")
      .eq("call_id", active.id)
      .neq("sender_id", userId ?? "")
      .order("id");
    if (error) throw error;
    for (const row of data ?? []) {
      if (
        current.current?.id !== active.id ||
        session !== media.current ||
        session.disposed ||
        seenIce.current.has(row.id)
      )
        continue;
      const candidate = callCandidateSchema.parse(row.candidate);
      await session.candidate({
        candidate: candidate.candidate,
        ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
        ...(candidate.sdpMLineIndex !== undefined
          ? { sdpMLineIndex: candidate.sdpMLineIndex }
          : {}),
        ...(candidate.usernameFragment !== undefined
          ? { usernameFragment: candidate.usernameFragment }
          : {}),
      });
      if (session === media.current && !session.disposed) seenIce.current.add(row.id);
    }
  }

  async function reconcile(active: VoiceCall) {
    if (active.caller_id !== userId && active.callee_id !== userId) return;
    if (!canApplyCall(current.current, active)) return;
    if (!isLiveCall(active)) {
      if (current.current?.id === active.id) {
        cleanup();
        toast(statuses[active.status] ?? "Дзвінок завершено");
      }
      return;
    }
    if (callExpired(active)) {
      await supabase.rpc("expire_voice_calls");
      return;
    }
    if (!current.current) {
      if (locked.current) return;
      if (active.status !== "ringing" || active.callee_id !== userId) {
        await action(active.id, "fail");
        return;
      }
      setName("Співрозмовник");
      const peerId = active.caller_id;
      void supabase
        .from("profiles")
        .select("display_name")
        .eq("id", peerId)
        .maybeSingle()
        .then(({ data }) => {
          if (current.current?.id === active.id) setName(data?.display_name ?? "Співрозмовник");
        });
      setPhase("Вхідний дзвінок");
    }
    current.current = active;
    setCall(active);
    setBusy(true);
    if (active.status === "accepted" && media.current) {
      const session = media.current;
      if (active.caller_id === userId && active.answer) {
        await session.description(callDescriptionSchema.parse(active.answer));
        if (
          session === media.current &&
          !session.disposed &&
          session.peer?.connectionState !== "connected"
        )
          setPhase("З’єднання…");
      }
    }
    await syncCandidates(active);
  }

  function enqueue(active: VoiceCall) {
    const version = generation.current;
    processing.current = processing.current
      .then(async () => {
        if (version === generation.current) await reconcile(active);
      })
      .catch(async (error: unknown) => {
        if (version === generation.current) await fail(error);
      });
  }

  async function start(conversation: string, peerName: string) {
    if (!userId || locked.current || current.current) return;
    locked.current = true;
    setWorking(true);
    setBusy(true);
    setName(peerName);
    setPhase("Доступ до мікрофона…");
    const version = generation.current;
    try {
      const { peer, session, queue } = await openMedia();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (session.disposed) return;
      const { data, error } = await supabase.rpc("start_voice_call", {
        _conversation_id: conversation,
        _offer: callDescriptionSchema.parse(offer),
      });
      if (error) throw error;
      if (!data) throw new Error("missing_call");
      if (version !== generation.current || session.disposed) {
        await action(data.id, "hangup");
        return;
      }
      current.current = data;
      setCall(data);
      setPhase("Виклик…");
      queue.bind(data.id);
      locked.current = false;
      setWorking(false);
    } catch (error) {
      if (version === generation.current) await fail(error);
    }
  }

  async function accept() {
    const active = current.current;
    if (!active || locked.current || active.status !== "ringing" || active.callee_id !== userId)
      return;
    locked.current = true;
    setWorking(true);
    setPhase("З’єднання…");
    const version = generation.current;
    try {
      const { peer, session } = await openMedia();
      await session.description(callDescriptionSchema.parse(active.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (version !== generation.current || session.disposed) return;
      const updated = await action(active.id, "accept", answer);
      if (version !== generation.current) return;
      if (updated.status !== "accepted") {
        session.dispose();
        await reconcile(updated);
        return;
      }
      await reconcile(updated);
      locked.current = false;
      setWorking(false);
    } catch (error) {
      if (version === generation.current) await fail(error);
    }
  }

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let polling = false;
    async function refresh() {
      if (polling || disposed) return;
      polling = true;
      try {
        const version = generation.current;
        const { error: expiryError } = await supabase.rpc("expire_voice_calls");
        if (expiryError) throw expiryError;
        const id = current.current?.id;
        let query = supabase.from("voice_calls").select("*");
        query = id ? query.eq("id", id) : query.in("status", ["ringing", "accepted"]);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!disposed && data && version === generation.current) enqueue(data);
      } catch {
        /* Live state expires locally if signaling is unavailable. */
      } finally {
        polling = false;
      }
    }
    const channel = supabase
      .channel(`calls-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_calls" }, (payload) => {
        if (!disposed) enqueue(payload.new as VoiceCall);
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_call_candidates" },
        () => {
          if (!disposed && current.current) enqueue(current.current);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    void refresh();
    const poll = window.setInterval(() => void refresh(), 3000);
    const heartbeat = window.setInterval(() => {
      const active = current.current;
      const version = generation.current;
      if (active?.status === "accepted")
        void action(active.id, "heartbeat")
          .then((updated) => {
            if (!disposed && version === generation.current && current.current?.id === active.id)
              enqueue(updated);
          })
          .catch(() => {});
    }, HEARTBEAT_MS);
    const expiry = window.setInterval(() => {
      const active = current.current;
      if (active && callExpired(active)) {
        cleanup();
        toast(active.status === "ringing" ? "Пропущений дзвінок" : "З’єднання втрачено");
        void supabase.rpc("expire_voice_calls");
      }
    }, 1000);
    function leave() {
      const active = current.current;
      cleanup();
      if (active) void action(active.id, "hangup").catch(() => {});
    }
    window.addEventListener("pagehide", leave);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.clearInterval(expiry);
      window.removeEventListener("pagehide", leave);
      leave();
      cleanup();
      void supabase.removeChannel(channel);
    };
    // The provider is keyed by identity; callbacks always belong to this user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const incoming = call?.status === "ringing" && call.callee_id === userId;
  return (
    <VoiceContext.Provider value={{ start, busy }}>
      {children}
      <audio ref={audio} autoPlay playsInline />
      {busy && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Голосовий дзвінок"
          className="fixed inset-x-3 top-[max(1rem,env(safe-area-inset-top))] z-50 mx-auto max-w-md rounded-lg border border-border bg-popover p-4 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name}</p>
              <p role="status" className="text-sm text-muted-foreground">
                {phase}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {incoming && (
              <Button
                onClick={() => void accept()}
                disabled={working}
                aria-label="Прийняти дзвінок"
                title="Прийняти дзвінок"
              >
                <Phone />
                Прийняти
              </Button>
            )}
            {!incoming && call?.status === "accepted" && (
              <Button
                variant="secondary"
                size="icon"
                aria-label={muted ? "Увімкнути мікрофон" : "Вимкнути мікрофон"}
                title={muted ? "Увімкнути мікрофон" : "Вимкнути мікрофон"}
                aria-pressed={muted}
                onClick={() => {
                  media.current?.mute(!muted);
                  setMuted(!muted);
                }}
              >
                {muted ? <MicOff /> : <Mic />}
              </Button>
            )}
            {audioBlocked && (
              <Button
                variant="secondary"
                onClick={() =>
                  void audio.current
                    ?.play()
                    .then(() => setAudioBlocked(false))
                    .catch(() => toast.error("Не вдалося відтворити звук"))
                }
              >
                <Volume2 />
                Увімкнути звук
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => void end(incoming ? "reject" : "hangup")}
              aria-label={incoming ? "Відхилити дзвінок" : "Завершити дзвінок"}
              title={incoming ? "Відхилити дзвінок" : "Завершити дзвінок"}
            >
              <PhoneOff />
              {incoming ? "Відхилити" : "Завершити"}
            </Button>
          </div>
        </section>
      )}
    </VoiceContext.Provider>
  );
}
