import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/bottom-nav";
import { mergeMessage, messagesQuery, peerQuery, sendMessage, type Message } from "@/lib/chat";
import { notifyNewMessage } from "@/lib/push.functions";
import { MESSAGE_MAX, messageBodySchema, translateChatError } from "@/lib/validation";

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
  const peer = useQuery(peerQuery(conversationId, user.id));
  const msgs = useInfiniteQuery({ ...messagesQuery(conversationId), enabled: !!peer.data });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          qc.setQueryData<Pages>(messagesQuery(conversationId).queryKey, (old) =>
            old ? { ...old, pages: mergeMessage(old.pages, m) } : old,
          );
        },
      )
      .subscribe((status) => {
        // Recover anything missed while (re)connecting.
        if (status === "SUBSCRIBED") qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, peer.data, qc]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const parsed = messageBodySchema.safeParse(text);
    if (!parsed.success || sending) return;
    setSending(true);
    try {
      const m = await sendMessage(conversationId, user.id, parsed.data);
      stickBottom.current = true;
      qc.setQueryData<Pages>(messagesQuery(conversationId).queryKey, (old) =>
        old ? { ...old, pages: mergeMessage(old.pages, m) } : old,
      );
      setText("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      notifyNewMessage({ data: { messageId: m.id } }).catch(() => {});
    } catch (err) {
      toast.error(translateChatError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      submit();
    }
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
          <p className="font-semibold">{peer.isError ? "Не вдалося відкрити чат" : "Чат не знайдено"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Можливо, у вас немає доступу до цієї розмови.</p>
          <Link to="/chats" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
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
        <Link to="/chats" aria-label="Назад" className="grid h-10 w-10 place-items-center rounded-full hover:bg-card">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">@{p.username}</p>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-3 py-4"
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
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] ${
                      mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card"
                    }`}
                  >
                    {m.body}
                    <span className={`ml-2 align-bottom text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <label htmlFor="msg" className="sr-only">
          Повідомлення
        </label>
        <textarea
          id="msg"
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Повідомлення"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-input bg-surface px-4 py-2.5 outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Надіслати"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
        </button>
      </form>
    </main>
  );
}
