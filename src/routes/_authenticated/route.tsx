import { createFileRoute, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/lib/chat";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

/** Global in-app notifications: one realtime channel for all my conversations (RLS-filtered). */
function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const router = useRouter();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    const channel = supabase
      .channel(`inbox-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          qc.invalidateQueries({ queryKey: ["conversations"] });
          if (msg.sender_id === user.id) return;
          if (pathRef.current === `/chats/${msg.conversation_id}`) return;
          toast(msg.body.length > 80 ? msg.body.slice(0, 80) + "…" : msg.body, {
            description: "Нове повідомлення",
            action: {
              label: "Відкрити",
              onClick: () =>
                router.navigate({
                  to: "/chats/$conversationId",
                  params: { conversationId: msg.conversation_id },
                }),
            },
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, qc, router]);

  return <Outlet />;
}
