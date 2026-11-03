import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAiPrefs } from "@/components/ai-prefs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const aiConversationsQuery = {
  queryKey: ["ai-conversations"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
};

export async function clearAiHistory(userId: string) {
  const { error } = await supabase.from("ai_conversations").delete().eq("user_id", userId);
  if (error) throw error;
}

export function ClearHistory({ userId }: { userId: string }) {
  const { t } = useAiPrefs();
  const qc = useQueryClient();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="mt-6 w-full text-destructive">
          <Trash2 /> {t.clear}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.clear}</AlertDialogTitle>
          <AlertDialogDescription>{t.clearConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void clearAiHistory(userId)
                .then(() => {
                  toast.success(t.cleared);
                  void qc.invalidateQueries({ queryKey: ["ai-conversations"] });
                })
                .catch(() => toast.error(t.error))
            }
          >
            {t.del}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
