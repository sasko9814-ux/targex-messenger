import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Loader2, Plus } from "lucide-react";
import { aiConversationsQuery, ClearHistory } from "@/components/ai-history";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { useAiPrefs } from "@/components/ai-prefs";

export const Route = createFileRoute("/_authenticated/ai/")({
  head: () => ({
    meta: [
      { title: "TargeX AI — TargeX" },
      { name: "description", content: "Ваш AI-асистент у месенджері TargeX." },
      { property: "og:title", content: "TargeX AI — TargeX" },
      { property: "og:description", content: "Ваш AI-асистент у месенджері TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiHome,
});

function AiHome() {
  const { user } = Route.useRouteContext();
  const { t, prefs } = useAiPrefs();
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useQuery(aiConversationsQuery);
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    setCreating(false);
    if (error) return toast.error(t.error);
    void qc.invalidateQueries({ queryKey: ["ai-conversations"] });
    void nav({ to: "/ai/$id", params: { id: data.id } });
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6 text-primary" /> {t.ai}
        </h1>
        <Button onClick={() => void create()} disabled={creating || !prefs.enabled} size="sm">
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} {t.newChat}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.aiLabel}</p>
      {!prefs.enabled && <p className="mt-4 rounded-lg border border-border p-3 text-sm text-muted-foreground">{t.disabled}</p>}
      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">{t.history}</h2>
      {list.isPending ? (
        <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-primary" />
      ) : list.isError ? (
        <p className="text-sm text-destructive">{t.error}. <button className="underline" onClick={() => list.refetch()}>↻</button></p>
      ) : list.data.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t.emptyHistory}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.data.map((c) => (
            <li key={c.id}>
              <Link to="/ai/$id" params={{ id: c.id }} className="block px-4 py-3 hover:bg-card">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleString(prefs.ui === "en" ? "en-GB" : "uk-UA")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!!list.data?.length && <ClearHistory userId={user.id} />}
      <BottomNav />
    </main>
  );
}

