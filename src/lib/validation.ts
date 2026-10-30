import { z } from "zod";

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, "3–24 символи: латинські літери, цифри або _");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Вкажіть ім'я")
  .max(50, "Не більше 50 символів");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Вкажіть email")
  .max(255, "Задовгий email")
  .email("Некоректний email");

export const passwordSchema = z
  .string()
  .min(8, "Мінімум 8 символів")
  .max(72, "Не більше 72 символів")
  .regex(/[A-Za-z]/, "Додайте хоча б одну літеру")
  .regex(/[0-9]/, "Додайте хоча б одну цифру");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Вкажіть пароль"),
});

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  bio: z
    .string()
    .trim()
    .max(300, "Не більше 300 символів")
    .transform((v) => (v === "" ? null : v)),
  avatarUrl: z
    .string()
    .trim()
    .max(500, "Задовге посилання")
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Посилання має починатися з https://")
    .transform((v) => (v === "" ? null : v)),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Maps backend auth/database errors to Ukrainian user-facing messages. */
export function translateError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Невірний email або пароль";
  if (m.includes("email not confirmed")) return "Підтвердіть email — перевірте пошту";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Цей email уже зареєстровано";
  if (m.includes("profiles_username_unique") || m.includes("duplicate key"))
    return "Це ім'я користувача вже зайняте";
  if (m.includes("pwned") || m.includes("weak")) return "Пароль занадто простий або скомпрометований";
  if (m.includes("rate limit")) return "Забагато спроб. Спробуйте пізніше";
  if (m.includes("failed to fetch") || m.includes("network")) return "Немає з'єднання з мережею";
  return "Щось пішло не так. Спробуйте ще раз";
}

export const MESSAGE_MAX = 4000;

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Порожнє повідомлення")
  .max(MESSAGE_MAX, `Не більше ${MESSAGE_MAX} символів`);

export const startChatSchema = z.object({ username: usernameSchema });

export const callDescriptionSchema = z.object({
  type: z.enum(["offer", "answer"]),
  sdp: z.string().min(1).max(65536).refine((value) => value.trim().length > 0),
});
export const callCandidateSchema = z.object({
  candidate: z.string().max(4096),
  sdpMid: z.string().max(256).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
}).strict();

/** Maps chat RPC errors to Ukrainian. */
export function translateChatError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("user_not_found")) return "Користувача з таким іменем не знайдено";
  if (m.includes("cannot_chat_with_self")) return "Не можна почати чат із самим собою";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "Немає доступу до цього чату";
  if (m.includes("body_len")) return "Повідомлення порожнє або задовге";
  return translateError(message);
}
