import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, UserRound, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TargeX — месенджер для Android" },
      { name: "description", content: "Створіть акаунт TargeX і налаштуйте свій профіль за хвилину." },
      { property: "og:title", content: "TargeX — месенджер для Android" },
      { property: "og:description", content: "Створіть акаунт TargeX і налаштуйте свій профіль за хвилину." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: ShieldCheck, title: "Захищений доступ", text: "Ваші дані бачите лише ви." },
  { icon: UserRound, title: "Власний профіль", text: "Унікальне ім'я, фото та опис." },
  { icon: Smartphone, title: "Як застосунок", text: "Додайте на головний екран Android." },
];

function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <main className="bg-glow mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <Brand />
      <section className="mt-auto pt-16">
        <h1 className="font-display text-4xl font-bold leading-tight">
          Спілкування, що <span className="text-primary">влучає в ціль</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Створіть акаунт, оберіть ім'я користувача і будьте готові до перших розмов.
        </p>
        <ul className="mt-8 space-y-3">
          {features.map((f) => (
            <li key={f.title} className="flex items-center gap-4 rounded-2xl bg-card p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-10 space-y-3">
        {signedIn ? (
          <Link
            to="/profile"
            className="shadow-glow flex h-12 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
          >
            Мій профіль
          </Link>
        ) : (
          <>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="shadow-glow flex h-12 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
            >
              Створити акаунт
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="flex h-12 items-center justify-center rounded-full border border-input font-medium"
            >
              У мене вже є акаунт
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
