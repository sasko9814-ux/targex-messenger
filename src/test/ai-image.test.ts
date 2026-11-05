import { describe, expect, it } from "vitest";
import { aiImageSchema, checkAiImageFile, AI_IMAGE_MAX_BYTES } from "@/lib/ai";

const id = "6b1f8a3e-0c4d-4b8e-9f2a-1d2c3b4a5e6f";
const ok = { conversationId: id, prompt: "що тут?", image: "data:image/png;base64,iVBORw0KGgo=" };

describe("AI image analysis schema", () => {
  it("accepts a valid png data URL", () => expect(aiImageSchema.safeParse(ok).success).toBe(true));
  it("rejects wrong MIME", () => {
    expect(
      aiImageSchema.safeParse({ ...ok, image: "data:image/gif;base64,R0lGOD==" }).success,
    ).toBe(false);
    expect(checkAiImageFile({ name: "a.gif", type: "image/gif", size: 10 })).toBe("type");
    expect(checkAiImageFile({ name: "a.png", type: "image/jpeg", size: 10 })).toBe("type");
  });
  it("rejects images over 5 MiB", () => {
    expect(
      checkAiImageFile({ name: "a.jpg", type: "image/jpeg", size: AI_IMAGE_MAX_BYTES + 1 }),
    ).toBe("size");
    expect(
      checkAiImageFile({ name: "a.jpg", type: "image/jpeg", size: AI_IMAGE_MAX_BYTES }),
    ).toBeNull();
    const big = "data:image/png;base64," + "A".repeat(Math.ceil((AI_IMAGE_MAX_BYTES + 3) / 3) * 4);
    expect(aiImageSchema.safeParse({ ...ok, image: big }).success).toBe(false);
  });
  it("rejects malformed data URLs, bad ids and extra fields", () => {
    for (const image of [
      "iVBORw0KGgo=",
      "data:image/png,abc",
      "data:image/png;base64,ab$c",
      "data:image/png;base64,abc",
    ])
      expect(aiImageSchema.safeParse({ ...ok, image }).success).toBe(false);
    expect(aiImageSchema.safeParse({ ...ok, conversationId: "x" }).success).toBe(false);
    expect(aiImageSchema.safeParse({ ...ok, userId: id }).success).toBe(false);
  });
});
