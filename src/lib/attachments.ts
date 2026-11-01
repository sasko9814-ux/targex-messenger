import { supabase } from "@/integrations/supabase/client";
import { attachmentSchema, chatFileSchema } from "@/lib/validation";
import type { z } from "zod";

export type Attachment = z.infer<typeof attachmentSchema>;
export const FILE_BUCKET = "chat-files";
export function fileSize(size: number) {
  return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} КБ` : `${(size / 1024 / 1024).toFixed(1)} МБ`;
}
export function mediaKind(file: Pick<Attachment, "name" | "type">) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "") && file.type.startsWith("image/")) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(extension ?? "") && file.type.startsWith("video/")) return "video";
  return "file";
}

export async function uploadAttachment(file: File, conversationId: string, userId: string, progress: (value: number) => void, signal: AbortSignal): Promise<Attachment> {
  const meta = chatFileSchema.parse({ name: file.name, size: file.size, type: file.type || "application/octet-stream" });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Не вдалося підготувати завантаження");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = () => signal.removeEventListener("abort", abort);
    xhr.open("PUT", data.signedUrl);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress(Math.min(99, Math.round(e.loaded / e.total * 100))); };
    xhr.onload = () => { finish(); if (xhr.status >= 200 && xhr.status < 300) { progress(100); resolve(); } else reject(new Error("Не вдалося завантажити файл. Перевірте доступ і спробуйте ще раз")); };
    xhr.onerror = () => { finish(); reject(new Error("Помилка мережі під час завантаження")); };
    xhr.onabort = () => { finish(); reject(new Error("Завантаження скасовано")); };
    signal.addEventListener("abort", abort, { once: true });
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    if (signal.aborted) { finish(); reject(new Error("Завантаження скасовано")); return; }
    xhr.send(form);
  });
  return { ...meta, path };
}

export async function downloadAttachment(file: Attachment) {
  const { data, error } = await supabase.storage.from(FILE_BUCKET).download(file.path);
  if (error || !data) throw error ?? new Error("Не вдалося завантажити файл");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}