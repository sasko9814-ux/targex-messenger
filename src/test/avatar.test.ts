import { describe, expect, it } from "vitest";
import {
  checkAvatarFile,
  isAvatarPath,
  isOwnAvatarPath,
  newAvatarPath,
  AVATAR_MAX_BYTES,
} from "@/lib/avatar-rules";

const me = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const id = "33333333-3333-3333-3333-333333333333";

describe("avatar rules", () => {
  it("accepts JPEG/PNG/WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(checkAvatarFile({ type, size: AVATAR_MAX_BYTES })).toBeNull();
  });
  it("rejects other types, empty and oversize files", () => {
    expect(checkAvatarFile({ type: "image/gif", size: 10 })).not.toBeNull();
    expect(checkAvatarFile({ type: "image/svg+xml", size: 10 })).not.toBeNull();
    expect(checkAvatarFile({ type: "image/png", size: 0 })).not.toBeNull();
    expect(checkAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).not.toBeNull();
  });
  it("builds paths inside the user's own folder, ignoring original filenames", () => {
    expect(newAvatarPath(me, "webp", id)).toBe(`${me}/${id}.webp`);
  });
  it("only treats own-folder paths as deletable", () => {
    expect(isOwnAvatarPath(me, `${me}/${id}.webp`)).toBe(true);
    expect(isOwnAvatarPath(me, `${other}/${id}.webp`)).toBe(false);
    expect(isOwnAvatarPath(me, `${me}/../${other}/${id}.webp`)).toBe(false);
    expect(isOwnAvatarPath(me, "https://example.com/a.png")).toBe(false);
    expect(isAvatarPath("https://example.com/a.png")).toBe(false);
  });
});
