import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";
import { Field } from "@/components/field";
import { signInSchema, signUpSchema, translateError } from "@/lib/validation";
import { isUsernameAvailable } from "@/lib/profile";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Вхід і реєстрація — TargeX" },
      { name: "description", content: "Увійдіть або створіть новий акаунт TargeX." },
      { property: "og:title", content: "Вхід і реєстрація — TargeX" },
      { property: "og:description", content: "Увійдіть або створіть новий акаунт TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Errors = { [K in "email" | "password" | "username" | "displayName"]?: string | undefined };

function fieldErrors(err: z.ZodError): Errors {
  const out: Errors = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0]) as keyof Errors;
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

function AuthPage() {
  const { mode = "signin" } = Route.useSearch();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/profile", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    setErrors({});
    setFormError(null);
  }, [mode]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setLoading(true);
    try {
      if (mode === "signup") {
        const parsed = signUpSchema.safeParse(fd);
        if (!parsed.success) return setErrors(fieldErrors(parsed.error));
        setErrors({});
        if (!(await isUsernameAvailable(parsed.data.username))) {
          return setErrors({ username: "Це ім'я користувача вже зайняте" });
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin + "/profile",
            data: { username: parsed.data.username, display_name: parsed.data.displayName },
          },
        });
        if (error) return setFormError(translateError(error.message));
        if (data.session) navigate({ to: "/profile", replace: true });
        else setSentTo(parsed.data.email);
      } else {
        const parsed = signInSchema.safeParse(fd);
        if (!parsed.success) return setErrors(fieldErrors(parsed.error));
        setErrors({});
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) return setFormError(translateError(error.message));
        navigate({ to: "/profile", replace: true });
      }
    } catch (err) {
      setFormError(translateError(err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <main className="bg-glow mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-card text-primary">
          <MailCheck className="h-8 w-8" />
        </span>
        <h1 className="font-display mt-6 text-2xl font-bold">Перевірте пошту</h1>
        <p className="mt-3 text-muted-foreground">
          Ми надіслали лист на <span className="text-foreground">{sentTo}</span>. Перейдіть за
          посиланням, щоб підтвердити акаунт, а потім увійдіть.
        </p>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          onClick={() => setSentTo(null)}
          className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-input font-medium"
        >
          До входу
        </Link>
      </main>
    );
  }

  const isSignup = mode === "signup";

  return (
    <main className="bg-glow mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <Link to="/">
        <Brand />
      </Link>
      <h1 className="font-display mt-12 text-3xl font-bold">
        {isSignup ? "Створення акаунта" : "З поверненням"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {isSignup ? "Кілька кроків — і ви в TargeX." : "Увійдіть, щоб продовжити."}
      </p>

      <div className="mt-8 grid grid-cols-2 rounded-full bg-card p-1 text-sm font-medium">
        {(["signin", "signup"] as const).map((m) => (
          <Link
            key={m}
            to="/auth"
            search={{ mode: m }}
            replace
            className={`rounded-full py-2.5 text-center transition ${
              mode === m ? "bg-secondary text-foreground" : "text-muted-foreground"
            }`}
          >
            {m === "signin" ? "Вхід" : "Реєстрація"}
          </Link>
        ))}
      </div>

      <form key={mode} onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {isSignup && (
          <>
            <Field label="Ваше ім'я" name="displayName" autoComplete="name" maxLength={50} error={errors.displayName} />
            <Field
              label="Ім'я користувача"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              maxLength={24}
              error={errors.username}
              hint="Латинські літери, цифри та _, від 3 до 24 символів"
            />
          </>
        )}
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" error={errors.email} />
        <Field
          label="Пароль"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          error={errors.password}
          hint={isSignup ? "Мінімум 8 символів, літера та цифра" : undefined}
        />
        {formError && (
          <p role="alert" className="rounded-xl bg-destructive/15 px-4 py-3 text-sm text-destructive">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="shadow-glow flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSignup ? "Зареєструватися" : "Увійти"}
        </button>
      </form>
    </main>
  );
}
