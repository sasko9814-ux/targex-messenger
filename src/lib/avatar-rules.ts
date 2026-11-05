/** Client-safe avatar rules (mirrored by storage policies and the profiles CHECK). */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PATH_RE = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

export function checkAvatarFile(f: { type: string; size: number }): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(f.type))
    return "Підтримуються лише JPG, PNG або WebP";
  if (f.size <= 0) return "Файл порожній";
  if (f.size > AVATAR_MAX_BYTES) return "Фото має бути не більше 5 МБ";
  return null;
}

/** Stored value is a storage path (new uploads) or a legacy https URL. */
export function isAvatarPath(v: string | null | undefined): v is string {
  return !!v && PATH_RE.test(v);
}

/** True only for an avatar object inside this user's own folder. */
export function isOwnAvatarPath(userId: string, v: string | null | undefined): v is string {
  return isAvatarPath(v) && v.split("/")[0] === userId;
}

export function newAvatarPath(userId: string, ext: "webp" | "jpg" | "png", id: string) {
  return `${userId}/${id}.${ext}`;
}
