import { describe, expect, it } from "vitest";
import {
  passwordSchema,
  profileUpdateSchema,
  signInSchema,
  signUpSchema,
  translateError,
  usernameSchema,
} from "@/lib/validation";

describe("username", () => {
  it("accepts 3–24 lowercase latin/digits/underscore and lowercases input", () => {
    expect(usernameSchema.parse("  Sasha_01 ")).toBe("sasha_01");
  });
  it("rejects too short, too long, and cyrillic/spaces", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(25)).success).toBe(false);
    expect(usernameSchema.safeParse("саша").success).toBe(false);
    expect(usernameSchema.safeParse("sa sha").success).toBe(false);
  });
});

describe("password", () => {
  it("requires at least 8 chars with a letter and a digit", () => {
    expect(passwordSchema.safeParse("abc1234").success).toBe(false);
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("abcd1234").success).toBe(true);
  });
});

describe("sign up / sign in", () => {
  it("rejects invalid email", () => {
    const r = signUpSchema.safeParse({
      email: "nope",
      password: "abcd1234",
      username: "user1",
      displayName: "User",
    });
    expect(r.success).toBe(false);
  });
  it("requires a password on sign in", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("profile update", () => {
  const base = { username: "user1", displayName: "User", bio: "", avatarUrl: "" };
  it("turns empty bio and avatar into null", () => {
    const r = profileUpdateSchema.parse(base);
    expect(r.bio).toBeNull();
    expect(r.avatarUrl).toBeNull();
  });
  it("rejects bio over 300 chars", () => {
    expect(profileUpdateSchema.safeParse({ ...base, bio: "x".repeat(301) }).success).toBe(false);
  });
  it("rejects non-https avatar URLs", () => {
    expect(
      profileUpdateSchema.safeParse({ ...base, avatarUrl: "http://x.com/a.png" }).success,
    ).toBe(false);
    expect(
      profileUpdateSchema.safeParse({ ...base, avatarUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
  it("rejects display name over 50 chars", () => {
    expect(profileUpdateSchema.safeParse({ ...base, displayName: "x".repeat(51) }).success).toBe(
      false,
    );
  });
});

describe("translateError", () => {
  it("maps known backend errors to Ukrainian", () => {
    expect(translateError("Invalid login credentials")).toBe("Невірний email або пароль");
    expect(translateError('duplicate key value violates unique constraint "profiles_username_unique"')).toBe(
      "Це ім'я користувача вже зайняте",
    );
  });
});
