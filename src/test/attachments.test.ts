import { describe, expect, it } from "vitest";
import { attachmentsSchema, chatFileSchema } from "@/lib/validation";
import { mergeMessage, type Message } from "@/lib/chat";
import { mediaKind } from "@/lib/attachments";

describe("chat attachments", () => {
  it("accepts requested images, videos and common documents", () => {
    for (const extension of ["jpg", "png", "webp", "mp4", "webm", "pdf", "docx", "txt", "zip"]) {
      expect(
        chatFileSchema.safeParse({
          name: `file.${extension}`,
          size: 100,
          type: "application/octet-stream",
        }).success,
      ).toBe(true);
    }
  });
  it("rejects unsupported executable and active web files", () => {
    for (const extension of ["exe", "html", "svg", "js"])
      expect(
        chatFileSchema.safeParse({
          name: `file.${extension}`,
          size: 100,
          type: "application/octet-stream",
        }).success,
      ).toBe(false);
  });
  it("rejects empty files and files exceeding 50 MiB", () => {
    const file = { name: "file.pdf", type: "application/pdf" };
    expect(chatFileSchema.safeParse({ ...file, size: 0 }).success).toBe(false);
    expect(chatFileSchema.safeParse({ ...file, size: 52428800 }).success).toBe(true);
    expect(chatFileSchema.safeParse({ ...file, size: 52428801 }).success).toBe(false);
  });
  it("limits a message to ten files", () => {
    const file = { name: "file.txt", size: 5, type: "text/plain", path: "c/u/file.txt" };
    expect(attachmentsSchema.safeParse(Array(10).fill(file)).success).toBe(true);
    expect(attachmentsSchema.safeParse(Array(11).fill(file)).success).toBe(false);
  });
  it("renders only compatible media extensions and types inline", () => {
    expect(mediaKind({ name: "photo.PNG", type: "image/png" })).toBe("image");
    expect(mediaKind({ name: "clip.webm", type: "video/webm" })).toBe("video");
    expect(mediaKind({ name: "doc.pdf", type: "image/png" })).toBe("file");
  });
});

describe("message updates", () => {
  const original: Message = {
    id: "1",
    body: "original",
    conversation_id: "c",
    sender_id: "u",
    created_at: "2026-11-01",
  };
  it("replaces edited messages without duplicates or order changes", () => {
    const updated = { ...original, body: "edited", edited_at: "2026-11-02" };
    expect(mergeMessage([[original]], updated)).toEqual([[updated]]);
  });
  it("synchronizes deletion tombstones and removes file metadata", () => {
    const deleted = {
      ...original,
      body: "Повідомлення видалено",
      deleted_at: "2026-11-02",
      attachments: [],
    };
    expect(mergeMessage([[original]], deleted)).toEqual([[deleted]]);
  });
});
