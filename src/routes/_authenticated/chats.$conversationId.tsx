import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft, Loader2, Phone, Sparkles, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { aiSummarizeChat } from "@/lib/ai.functions";
import { errorLabels } from "@/lib/ai-i18n";
import { useAiPrefs } from "@/components/ai-prefs";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/bottom-nav";
import { mergeMessage, messagesQuery, peerQuery, sendMessage, type Message } from "@/lib/chat";
import { notifyNewMessage } from "@/lib/push.functions";
import { attachmentsSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { useVoiceCalls } from "@/components/voice-calls";
import { ChatComposer } from "@/components/chat-composer";
import { MessageContent } from "@/components/message-content";
import type { Attachment } from "@/lib/attachments";

export const Route = createFileRoute("/_authenticated/chats/$conversationId")({
  head: () => ({
    meta: [
      { title: "Розмова — TargeX" },
      { name: "description", content: "Особиста розмова в TargeX." },
      { property: "og:title", content: "Розмова — TargeX" },
      { property: "og:description", content: "Особиста розмова в TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Pages = InfiniteData<Message[], unknown>;

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const voice = useVoiceCalls();
  const peer = useQuery(peerQuery(conversationId, user.id));
  const msgs = useInfiniteQuery({ ...messagesQuery(conversationId), enabled: !!peer.data });
  const { prefs } = useAiPrefs();
  const summarizeFn = useServerFn(aiSummarizeChat);
  const [summary, setSummary] = useState<
    | { s: "idle" }
    | { s: "confirm" }
    | { s: "loading" }
    | { s: "error"; msg: string }
    | { s: "done"; text: string }
  >({ s: "idle" });
  async function runSummary() {
    setSummary({ s: "loading" });
    try {
      const r = await summarizeFn({ data: { conversationId } });
      if (r.ok) setSummary({ s: "done", text: r.data });
      else
        setSummary({
          s: "error",
          msg:
            r.error === "invalid"
              ? "У чаті ще немає текстових повідомлень."
              : errorLabels.uk[r.error],
        });
    } catch {
      setSummary({ s: "error", msg: "Не вдалося створити підсумок. Спробуйте ще раз." });
    }
  }
  const scroller = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const list = (msgs.data?.pages ?? []).flat().slice().reverse();

  // Live updates for this conversation.
  useEffect(() => {
    if (!peer.data) return;
    const ch = supabase
      .channel(`conv-${conversationId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
            return;
          }
          const parsed = attachmentsSchema.safeParse((payload.new as Message).attachments ?? []);
          if (!parsed.success) return;
          const m = { ...payload.new, attachments: parsed.data } as Message;
          qc.setQueryData<Pages>(messagesQuery(conversationId).queryKey, (old) =>
            old ? { ...old, pages: mergeMessage(old.pages, m) } : old,
          );
          void qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe((status) => {
        // Recover anything missed while (re)connecting.
        if (status === "SUBSCRIBED")
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, peer.data, qc]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  async function submit(text: string, attachments: Attachment[]) {
    const m = await sendMessage(conversationId, user.id, text, attachments);
    stickBottom.current = true;
    qc.setQueryData<Pages>(messagesQuery(conversationId).queryKey, (old) =>
      old ? { ...old, pages: mergeMessage(old.pages, m) } : old,
    );
    qc.invalidateQueries({ queryKey: ["conversations"] });
    notifyNewMessage({ data: { messageId: m.id } }).catch(() => {});
  }

  if (peer.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (peer.isError || !peer.data) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
        <div>
          <p className="font-semibold">
            {peer.isError ? "Не вдалося відкрити чат" : "Чат не знайдено"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Можливо, у вас немає доступу до цієї розмови.
          </p>
          <Link
            to="/chats"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            До чатів
          </Link>
        </div>
      </main>
    );
  }

  const p = peer.data;
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/chats"
          aria-label="Назад"
          className="grid h-10 w-10 place-items-center rounded-full hover:bg-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={!prefs.enabled || summary.s === "loading"}
          aria-label="Підсумувати чат за допомогою AI"
          title={prefs.enabled ? "Підсумувати чат (AI)" : "AI-функції вимкнено в налаштуваннях"}
          onClick={() => setSummary({ s: "confirm" })}
        >
          <Sparkles />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={voice.busy}
          aria-label="Голосовий дзвінок"
          title="Голосовий дзвінок"
          onClick={() => void voice.start(conversationId, p.display_name)}
        >
          <Phone />
        </Button>
      </header>

      {summary.s !== "idle" && (
        <section
          aria-label="AI-підсумок чату"
          aria-live="polite"
          className="mx-3 mt-2 max-h-[45dvh] overflow-y-auto rounded-xl border border-border bg-card p-3 text-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="flex-1 font-semibold">Підсумок чату · TargeX AI</p>
            {summary.s !== "loading" && (
              <button
                aria-label="Закрити підсумок"
                onClick={() => setSummary({ s: "idle" })}
                className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {summary.s === "confirm" && (
            <>
              <p className="text-muted-foreground">
                AI обробить до 100 останніх текстових повідомлень цього приватного чату. Вкладення
                не читаються, а підсумок не зберігається і не надсилається співрозмовнику.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSummary({ s: "idle" })}>
                  Скасувати
                </Button>
                <Button size="sm" autoFocus onClick={() => void runSummary()}>
                  Підсумувати
                </Button>
              </div>
            </>
          )}
          {summary.s === "loading" && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Створюємо підсумок…
            </p>
          )}
          {summary.s === "error" && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-destructive">{summary.msg}</p>
              <Button variant="ghost" size="sm" onClick={() => void runSummary()}>
                Повторити
              </Button>
            </div>
          )}
          {summary.s === "done" && (
            <>
              <p className="whitespace-pre-wrap">{summary.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Згенеровано AI, може містити помилки.
              </p>
            </>
          )}
        </section>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        {msgs.hasNextPage && (
          <div className="mb-3 text-center">
            <button
              onClick={() => {
                stickBottom.current = false;
                msgs.fetchNextPage();
              }}
              disabled={msgs.isFetchingNextPage}
              className="rounded-full border border-input px-4 py-1.5 text-xs text-muted-foreground"
            >
              {msgs.isFetchingNextPage ? "Завантаження…" : "Попередні повідомлення"}
            </button>
          </div>
        )}
        {msgs.isPending ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : msgs.isError ? (
          <div className="text-center text-sm text-muted-foreground">
            Не вдалося завантажити повідомлення.{" "}
            <button className="text-primary underline" onClick={() => msgs.refetch()}>
              Повторити
            </button>
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Напишіть перше повідомлення для {p.display_name}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <MessageContent
                    message={m}
                    mine={mine}
                    onUpdate={(updated) =>
                      qc.setQueryData<Pages>(messagesQuery(conversationId).queryKey, (old) =>
                        old ? { ...old, pages: mergeMessage(old.pages, updated) } : old,
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ChatComposer
        context={list
          .filter((m) => !m.deleted_at && m.body.trim())
          .slice(-8)
          .map((m) => ({ id: m.id, mine: m.sender_id === user.id, text: m.body }))}
        key={conversationId}
        conversationId={conversationId}
        userId={user.id}
        onSend={submit}
      />
    </main>
  );
}
