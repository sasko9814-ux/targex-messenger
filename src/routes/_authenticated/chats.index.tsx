import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Loader2, MessageCirclePlus, Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { Avatar, BottomNav } from "@/components/bottom-nav";
import { conversationsQuery, startConversation } from "@/lib/chat";
import { startChatSchema, translateChatError } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/chats/")({
  head: () => ({
    meta: [
      { title: "Чати — TargeX" },
      { name: "description", content: "Ваші особисті розмови в TargeX." },
      { property: "og:title", content: "Чати — TargeX" },
      { property: "og:description", content: "Ваші особисті розмови в TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatsPage,
});

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

function ChatsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const q = useQuery(conversationsQuery());
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async (raw: string) => {
      const parsed = startChatSchema.safeParse({ username: raw.replace(/^@/, "") });
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      return startConversation(parsed.data.username);
    },
    onSuccess: (id) => navigate({ to: "/chats/$conversationId", params: { conversationId: id } }),
    onError: (e) => setError(translateChatError(e.message) === "Щось пішло не так. Спробуйте ще раз" && !e.message.includes("_") ? e.message : translateChatError(e.message)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start.mutate(String(new FormData(e.currentTarget).get("username") ?? ""));
  }

  return (
    <main className="bg-glow mx-auto min-h-dvh max-w-md px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="px-2">
        <Brand />
      </header>
      <h1 className="font-display mt-8 px-2 text-2xl font-bold">Чати</h1>

      <form onSubmit={onSubmit} className="mt-4 px-2">
        <label htmlFor="username" className="sr-only">
          Ім'я користувача
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="username"
              name="username"
              autoCapitalize="none"
              autoComplete="off"
              maxLength={25}
              placeholder="Почати чат: @username"
              className="h-12 w-full rounded-full border border-input bg-surface pl-11 pr-4 outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={start.isPending}
            aria-label="Почати чат"
            className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
          >
            {start.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCirclePlus className="h-5 w-5" />}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 px-2 text-sm text-destructive">{error}</p>}
      </form>

      <section className="mt-6">
        {q.isPending ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-2xl bg-card" />
            ))}
          </ul>
        ) : q.isError ? (
          <div className="rounded-2xl bg-card p-6 text-center">
            <p className="font-semibold">Не вдалося завантажити чати</p>
            <button onClick={() => q.refetch()} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
              Спробувати ще
            </button>
          </div>
        ) : q.data.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center">
            <p className="font-semibold">Поки що немає розмов</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Введіть ім'я користувача друга вище, щоб написати йому.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {q.data.map((c) => (
              <li key={c.conversation_id}>
                <Link
                  to="/chats/$conversationId"
                  params={{ conversationId: c.conversation_id }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-card"
                >
                  <Avatar name={c.peer_display_name} url={c.peer_avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{c.peer_display_name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(c.last_message_at)}</span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {c.last_body
                        ? (c.last_sender_id === user.id ? "Ви: " : "") + c.last_body
                        : `@${c.peer_username} · новий чат`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
