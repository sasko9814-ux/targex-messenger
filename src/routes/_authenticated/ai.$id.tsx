import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Copy, Loader2, RotateCcw, SendHorizontal, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAiPrefs, useOnline } from "@/components/ai-prefs";
import { aiChat } from "@/lib/ai.functions";
import { AI_INPUT_MAX } from "@/lib/ai";
import { errorLabels } from "@/lib/ai-i18n";

export const Route = createFileRoute("/_authenticated/ai/$id")({
  head: () => ({
    meta: [
      { title: "Розмова з TargeX AI — TargeX" },
      { name: "description", content: "Розмова з AI-асистентом TargeX." },
      { property: "og:title", content: "Розмова з TargeX AI — TargeX" },
      { property: "og:description", content: "Розмова з AI-асистентом TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiChatPage,
});

type Msg = { id: string; role: string; content: string };

function AiChatPage() {
  const { id } = Route.useParams();
  const { t, prefs } = useAiPrefs();
  const online = useOnline();
  const qc = useQueryClient();
  const nav = useNavigate();
  const chat = useServerFn(aiChat);
  const key = ["ai-messages", id];
  const conv = useQuery({
    queryKey: ["ai-conv", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_conversations").select("id, title").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const msgs = useQuery({
    queryKey: key,
    enabled: !!conv.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("id, role, content")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Msg[];
    },
  });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.data?.length, pending, busy]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(content?: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    if (content) setPending(content);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const r = await chat({ data: content ? { conversationId: id, content } : { conversationId: id, regenerate: true }, signal: ctrl.signal });
      if (!r.ok) {
        setError(errorLabels[prefs.ui][r.error]);
        if (content && r.error !== "cancelled") setText(content);
      }
    } catch {
      setError(ctrl.signal.aborted ? errorLabels[prefs.ui].cancelled : errorLabels[prefs.ui].provider);
    } finally {
      abort.current = null;
      setBusy(false);
      setPending(null);
      await qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["ai-conversations"] });
      void qc.invalidateQueries({ queryKey: ["ai-conv", id] });
      box.current?.focus();
    }
  }

  function submit() {
    const v = text.trim();
    if (!v || busy || !online || !prefs.enabled) return;
    setText("");
    void ask(v);
  }

  async function remove() {
    if (!confirm(t.clearConfirm)) return;
    const { error: e } = await supabase.from("ai_conversations").delete().eq("id", id);
    if (e) { toast.error(t.error); return; }
    void qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    void nav({ to: "/ai" });
  }

  if (conv.isPending) return <div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (conv.isError || !conv.data)
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="font-semibold">{conv.isError ? t.error : t.notFound}</p>
          <Link to="/ai" className="mt-4 inline-block text-primary underline">{t.back}</Link>
        </div>
      </main>
    );

  const list = msgs.data ?? [];
  const last = list[list.length - 1];
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link to="/ai" aria-label={t.back} className="grid h-10 w-10 place-items-center rounded-full hover:bg-card"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conv.data.title}</p>
          <p className="truncate text-xs text-muted-foreground">{t.aiLabel}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label={t.deleteChat} title={t.deleteChat} onClick={() => void remove()}><Trash2 /></Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {msgs.isPending ? (
          <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-primary" />
        ) : msgs.isError ? (
          <p className="text-center text-sm text-destructive">{t.error}</p>
        ) : list.length === 0 && !pending ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">{t.emptyChat}</p>
        ) : null}
        <ul className="space-y-3">
          {list.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">{m.content}</p></li>
            ) : (
              <li key={m.id} className="text-sm">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(m.content).then(() => toast.success(t.copied))}><Copy /> {t.copy}</Button>
                  {m.id === last?.id && !busy && (
                    <Button size="sm" variant="ghost" disabled={!online || !prefs.enabled} onClick={() => void ask()}><RotateCcw /> {t.regenerate}</Button>
                  )}
                </div>
              </li>
            ),
          )}
          {pending && <li className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground opacity-80">{pending}</p></li>}
          {busy && <li className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><Loader2 className="h-4 w-4 animate-spin" /> {t.thinking}</li>}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}{" "}
            {last?.role === "user" && !busy && <button className="underline" onClick={() => void ask()}>{t.regenerate}</button>}
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {!online && <p className="mb-2 text-xs text-destructive">{t.offline}</p>}
        {!prefs.enabled && <p className="mb-2 text-xs text-muted-foreground">{t.disabled}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="ai-msg" className="sr-only">{t.ask}</label>
          <textarea
            id="ai-msg"
            ref={box}
            autoFocus
            rows={1}
            value={text}
            maxLength={AI_INPUT_MAX}
            disabled={!prefs.enabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); submit(); }
            }}
            placeholder={t.ask}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-input bg-surface px-4 py-2.5 outline-none focus:border-primary"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" aria-label={t.stop} title={t.stop} className="h-11 w-11 shrink-0 rounded-full" onClick={() => abort.current?.abort()}><Square /></Button>
          ) : (
            <Button type="submit" size="icon" aria-label={t.send} disabled={!text.trim() || !online || !prefs.enabled} className="h-11 w-11 shrink-0 rounded-full"><SendHorizontal /></Button>
          )}
        </div>
      </form>
    </main>
  );
}
