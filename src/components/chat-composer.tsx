import { useEffect, useRef, useState, type FormEvent } from "react";
import { Paperclip, SendHorizontal, X, File, Loader2, Sparkle } from "lucide-react";
import { AiAssistPanel, type ContextMsg } from "@/components/ai-assist-panel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  chatFileSchema,
  FILE_COUNT_MAX,
  FILE_EXTENSIONS,
  MESSAGE_MAX,
  messageBodySchema,
} from "@/lib/validation";
import {
  fileSize,
  mediaKind,
  uploadAttachment,
  FILE_BUCKET,
  type Attachment,
} from "@/lib/attachments";
import { supabase } from "@/integrations/supabase/client";

type PendingFile = {
  id: string;
  file: File;
  preview?: string;
  progress: number;
  uploaded?: Attachment;
};

export function ChatComposer({
  conversationId,
  userId,
  onSend,
  context = [],
}: {
  context?: ContextMsg[];
  conversationId: string;
  userId: string;
  onSend: (text: string, files: Attachment[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const liveFiles = useRef<PendingFile[]>([]);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const updateFiles = (next: PendingFile[]) => {
    liveFiles.current = next;
    setFiles(next);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      for (const f of liveFiles.current) if (f.preview) URL.revokeObjectURL(f.preview);
      const paths = liveFiles.current.flatMap((f) => (f.uploaded ? [f.uploaded.path] : []));
      if (paths.length) void supabase.storage.from(FILE_BUCKET).remove(paths);
    };
  }, []);

  function select(selected: FileList | null) {
    if (!selected) return;
    const next = [...liveFiles.current];
    for (const file of Array.from(selected)) {
      if (next.length >= FILE_COUNT_MAX) {
        toast.error("Не більше 10 файлів за раз");
        break;
      }
      const result = chatFileSchema.safeParse({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      });
      if (!result.success) {
        toast.error(`${file.name}: ${result.error.issues[0]?.message}`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        ...(mediaKind(file) === "image" ? { preview: URL.createObjectURL(file) } : {}),
      });
    }
    updateFiles(next);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    const f = liveFiles.current.find((entry) => entry.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    if (f?.uploaded) void supabase.storage.from(FILE_BUCKET).remove([f.uploaded.path]);
    updateFiles(liveFiles.current.filter((entry) => entry.id !== id));
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    const body = text.trim() || "📎 Файли";
    const parsed = messageBodySchema.safeParse(body);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }
    setSending(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      for (const f of liveFiles.current) {
        if (f.uploaded) continue;
        const uploaded = await uploadAttachment(
          f.file,
          conversationId,
          userId,
          (progress) => {
            if (mounted.current)
              updateFiles(
                liveFiles.current.map((entry) =>
                  entry.id === f.id ? { ...entry, progress } : entry,
                ),
              );
          },
          abort.signal,
        );
        if (!mounted.current) {
          void supabase.storage.from(FILE_BUCKET).remove([uploaded.path]);
          return;
        }
        updateFiles(
          liveFiles.current.map((entry) =>
            entry.id === f.id ? { ...entry, uploaded, progress: 100 } : entry,
          ),
        );
      }
      await onSend(
        parsed.data,
        liveFiles.current.flatMap((f) => (f.uploaded ? [f.uploaded] : [])),
      );
      for (const f of liveFiles.current) if (f.preview) URL.revokeObjectURL(f.preview);
      updateFiles([]);
      if (mounted.current) setText("");
    } catch (error) {
      if (mounted.current)
        toast.error(error instanceof Error ? error.message : "Не вдалося надіслати файли");
    } finally {
      if (mounted.current) setSending(false);
      controller.current = null;
    }
  }

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      {aiOpen && (
        <AiAssistPanel
          draft={text}
          context={context}
          onClose={() => setAiOpen(false)}
          onInsert={(v) => setText(v.slice(0, MESSAGE_MAX))}
        />
      )}
      {!!files.length && (
        <ul className="mb-3 flex max-h-48 gap-2 overflow-x-auto pb-1" aria-label="Вибрані файли">
          {files.map((f) => (
            <li
              key={f.id}
              className="relative w-32 shrink-0 rounded-lg border border-border bg-card p-2"
            >
              {f.preview ? (
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-20 w-full rounded object-cover"
                />
              ) : (
                <div className="grid h-20 place-items-center text-muted-foreground">
                  <File className="h-8 w-8" />
                </div>
              )}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={sending}
                onClick={() => remove(f.id)}
                aria-label={`Прибрати ${f.file.name}`}
                className="absolute right-1 top-1 h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
              <p className="mt-1 truncate text-xs" title={f.file.name}>
                {f.file.name}
              </p>
              <p className="text-[10px] text-muted-foreground">{fileSize(f.file.size)}</p>
              {sending && (
                <>
                  <progress
                    aria-label={`Завантаження ${f.file.name}`}
                    max={100}
                    value={f.progress}
                    className="h-1 w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">{f.progress}%</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept={FILE_EXTENSIONS.map((extension) => `.${extension}`).join(",")}
          onChange={(e) => select(e.target.files)}
          className="hidden"
          aria-label="Вибрати файли"
          disabled={sending}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-9 shrink-0"
          disabled={sending}
          onClick={() => input.current?.click()}
          aria-label="Прикріпити файли"
          title="Прикріпити файли"
        >
          <Paperclip />
        </Button>
        <Button
          type="button"
          variant={aiOpen ? "secondary" : "ghost"}
          size="icon"
          className="h-11 w-9 shrink-0"
          aria-label="TargeX AI"
          aria-pressed={aiOpen}
          title="TargeX AI"
          onClick={() => setAiOpen((v) => !v)}
        >
          <Sparkle />
        </Button>
        <label htmlFor="msg" className="sr-only">
          Повідомлення
        </label>
        <textarea
          id="msg"
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          disabled={sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Повідомлення"
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border border-input bg-surface px-4 py-2.5 outline-none focus:border-primary"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || (!text.trim() && !files.length)}
          aria-label="Надіслати"
          className="h-11 w-11 shrink-0 rounded-full"
        >
          {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
    </form>
  );
}
