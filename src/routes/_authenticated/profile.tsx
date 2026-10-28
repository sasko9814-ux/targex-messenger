import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Loader2, LogOut, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";
import { Field } from "@/components/field";
import { myProfileQuery, updateMyProfile, isUsernameAvailable } from "@/lib/profile";
import { profileUpdateSchema, translateError } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Мій профіль — TargeX" },
      { name: "description", content: "Керуйте своїм профілем TargeX." },
      { property: "og:title", content: "Мій профіль — TargeX" },
      { property: "og:description", content: "Керуйте своїм профілем TargeX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery(myProfileQuery(user.id));
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avatarBroken, setAvatarBroken] = useState(false);

  const save = useMutation({
    mutationFn: async (fd: Record<string, string>) => {
      const parsed = profileUpdateSchema.safeParse(fd);
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
        setErrors(errs);
        throw new Error("validation");
      }
      if (parsed.data.username !== q.data?.username && !(await isUsernameAvailable(parsed.data.username))) {
        setErrors({ username: "Це ім'я користувача вже зайняте" });
        throw new Error("validation");
      }
      setErrors({});
      return updateMyProfile(user.id, parsed.data);
    },
    onSuccess: (data) => {
      qc.setQueryData(myProfileQuery(user.id).queryKey, data);
      setAvatarBroken(false);
      setEditing(false);
      toast.success("Профіль збережено");
    },
    onError: (e) => {
      if (e.message !== "validation") toast.error(translateError(e.message));
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
  }

  return (
    <main className="bg-glow mx-auto min-h-dvh max-w-md px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Brand />
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-full border border-input px-4 py-2 text-sm"
        >
          <LogOut className="h-4 w-4" /> Вийти
        </button>
      </header>

      {q.isPending ? (
        <div className="mt-16 flex flex-col items-center gap-4" aria-busy="true">
          <div className="h-24 w-24 animate-pulse rounded-full bg-card" />
          <div className="h-5 w-40 animate-pulse rounded bg-card" />
          <div className="h-4 w-24 animate-pulse rounded bg-card" />
        </div>
      ) : q.isError ? (
        <div className="mt-16 rounded-2xl bg-card p-6 text-center">
          <p className="font-semibold">Не вдалося завантажити профіль</p>
          <p className="mt-1 text-sm text-muted-foreground">{translateError(q.error.message)}</p>
          <button
            onClick={() => q.refetch()}
            className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Спробувати ще
          </button>
        </div>
      ) : !q.data ? (
        <div className="mt-16 rounded-2xl bg-card p-6 text-center">
          <p className="font-semibold">Профіль ще не створено</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Спробуйте вийти й увійти знову. Якщо не допоможе — створіть акаунт повторно.
          </p>
        </div>
      ) : editing ? (
        <form onSubmit={onSubmit} noValidate className="mt-10 space-y-4">
          <h1 className="font-display text-2xl font-bold">Редагування профілю</h1>
          <Field label="Ваше ім'я" name="displayName" defaultValue={q.data.display_name} maxLength={50} error={errors.displayName} />
          <Field
            label="Ім'я користувача"
            name="username"
            defaultValue={q.data.username}
            autoCapitalize="none"
            maxLength={24}
            error={errors.username}
            hint="Латинські літери, цифри та _, від 3 до 24 символів"
          />
          <div className="space-y-1.5">
            <label htmlFor="bio" className="text-sm font-medium text-muted-foreground">
              Про себе
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={300}
              defaultValue={q.data.bio ?? ""}
              aria-invalid={!!errors.bio}
              className="w-full rounded-xl border border-input bg-surface px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            />
            {errors.bio && <p className="text-sm text-destructive">{errors.bio}</p>}
          </div>
          <Field
            label="Посилання на фото"
            name="avatarUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={q.data.avatar_url ?? ""}
            error={errors.avatarUrl}
          />
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setErrors({});
                setEditing(false);
              }}
              className="h-12 flex-1 rounded-full border border-input font-medium"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Зберегти
            </button>
          </div>
        </form>
      ) : (
        <section className="mt-12 text-center">
          {q.data.avatar_url && !avatarBroken ? (
            <img
              src={q.data.avatar_url}
              alt=""
              onError={() => setAvatarBroken(true)}
              referrerPolicy="no-referrer"
              className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-primary"
            />
          ) : (
            <div className="font-display mx-auto grid h-24 w-24 place-items-center rounded-full bg-secondary text-2xl font-bold text-primary ring-2 ring-primary">
              {initials(q.data.display_name)}
            </div>
          )}
          <h1 className="font-display mt-5 text-2xl font-bold">{q.data.display_name}</h1>
          <p className="text-primary">@{q.data.username}</p>
          <p className="mt-4 whitespace-pre-wrap text-muted-foreground">
            {q.data.bio || "Розкажіть трохи про себе — натисніть «Редагувати»."}
          </p>
          <dl className="mt-8 space-y-2 rounded-2xl bg-card p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">З нами з</dt>
              <dd>{new Date(q.data.created_at).toLocaleDateString("uk-UA")}</dd>
            </div>
          </dl>
          <button
            onClick={() => setEditing(true)}
            className="shadow-glow mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground"
          >
            <Pencil className="h-4 w-4" /> Редагувати
          </button>
        </section>
      )}
    </main>
  );
}
