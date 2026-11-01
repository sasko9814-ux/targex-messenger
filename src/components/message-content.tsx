import { useEffect, useState } from "react";
import { Download, File, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadAttachment, FILE_BUCKET, fileSize, mediaKind, type Attachment } from "@/lib/attachments";
import { modifyMessage, type Message } from "@/lib/chat";
import { MESSAGE_MAX, translateChatError } from "@/lib/validation";

function AttachmentView({ file }: { file: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const kind = mediaKind(file);
  useEffect(() => {
    if (kind === "file") return;
    let active = true;
    async function refresh() {
      const result = await supabase.storage.from(FILE_BUCKET).createSignedUrl(file.path, 120);
      if (active) { setUrl(result.data?.signedUrl ?? null); setError(!!result.error); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 90000);
    return () => { active = false; clearInterval(timer); };
  }, [file.path, kind]);
  async function download() {
    setLoading(true);
    try { await downloadAttachment(file); } catch { toast.error("Не вдалося завантажити файл. Спробуйте ще раз"); }
    finally { setLoading(false); }
  }
  return <div className="overflow-hidden rounded-lg border border-border bg-surface text-foreground">
    {kind !== "file" && (url ? kind === "image" ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={file.name} loading="lazy" onError={() => setError(true)} className="max-h-72 w-full object-contain" /></a> : <video src={url} controls preload="metadata" className="max-h-72 w-full" /> : <div className="grid h-28 place-items-center text-muted-foreground">{error ? "Попередній перегляд недоступний" : <Loader2 className="h-5 w-5 animate-spin" />}</div>)}
    <div className="flex items-center gap-2 p-2"><File className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-all text-xs font-medium">{file.name}</p><p className="text-[10px] text-muted-foreground">{file.name.split(".").at(-1)?.toUpperCase()} · {fileSize(file.size)}</p></div><Button variant="ghost" size="icon" disabled={loading} onClick={() => void download()} aria-label={`Завантажити ${file.name}`} title="Завантажити">{loading ? <Loader2 className="animate-spin" /> : <Download />}</Button></div>
  </div>;
}

export function MessageContent({ message, mine, onUpdate }: { message: Message; mine: boolean; onUpdate: (message: Message) => void }) {
  const [action, setAction] = useState<"edit" | "delete" | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await modifyMessage(message.id, action === "edit" ? { body: text } : { deleted_at: new Date().toISOString() });
      onUpdate(updated); setAction(null);
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) { toast.error(translateChatError(error instanceof Error ? error.message : String(error))); }
    finally { setSaving(false); }
  }
  return <div className={`min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-[15px] ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card"}`}>
    <div className="flex items-start gap-1"><p className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${message.deleted_at ? "italic opacity-70" : ""}`}>{message.body === "📎 Файли" && message.attachments?.length ? null : message.body}</p>
      {mine && !message.deleted_at && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-7 w-7 shrink-0 text-inherit" aria-label="Дії з повідомленням"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setText(message.body); setAction("edit"); }}><Pencil />Редагувати</DropdownMenuItem><DropdownMenuItem onSelect={() => setAction("delete")} className="text-destructive"><Trash2 />Видалити для всіх</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
    </div>
    {!message.deleted_at && !!message.attachments?.length && <div className="mt-1 space-y-2">{message.attachments.map((f) => <AttachmentView key={f.path} file={f} />)}</div>}
    <p className="mt-1 text-right text-[10px] opacity-70">{message.edited_at && !message.deleted_at ? "редаговано · " : ""}{new Date(message.created_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</p>
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !saving) setAction(null); }}><DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md"><DialogTitle>{action === "edit" ? "Редагувати повідомлення" : "Видалити повідомлення?"}</DialogTitle><DialogDescription>{action === "edit" ? "Зміни побачать усі учасники розмови." : "Текст і вкладення буде приховано для всіх учасників."}</DialogDescription>
      {action === "edit" && <textarea aria-label="Текст повідомлення" value={text} onChange={(e) => setText(e.target.value)} maxLength={MESSAGE_MAX} rows={4} className="w-full resize-y rounded-lg border border-input bg-surface p-3 text-foreground" />}
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setAction(null)}>Скасувати</Button><Button variant={action === "delete" ? "destructive" : "default"} disabled={saving || (action === "edit" && !text.trim())} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : action === "edit" ? "Зберегти" : "Видалити для всіх"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}