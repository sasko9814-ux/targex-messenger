import { createFileRoute } from "@tanstack/react-router";
import { Check, Palette } from "lucide-react";
import { Brand } from "@/components/brand";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/components/appearance";
import { themes } from "@/lib/appearance";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Налаштування оформлення — TargeX" },
    { name: "description", content: "Оберіть оформлення свого месенджера TargeX." },
    { property: "og:title", content: "Налаштування оформлення — TargeX" },
    { property: "og:description", content: "Оберіть оформлення свого месенджера TargeX." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, select } = useAppearance();
  return <main className="mx-auto min-h-dvh max-w-md px-6 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">
    <Brand />
    <h1 className="font-display mt-8 text-2xl font-bold">Налаштування</h1>
    <section className="mt-8" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold"><Palette className="h-5 w-5 text-primary" />Оформлення</h2>
      <div className="grid grid-cols-2 gap-3">
        {themes.map((option) => <Button key={option.id} variant="outline" aria-label={option.name} aria-pressed={theme === option.id} onClick={() => select(option.id)} className="h-auto min-w-0 flex-col items-stretch gap-3 whitespace-normal rounded-lg p-3 aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-ring">
          <span data-theme={option.id} className="theme-preview flex h-24 flex-col gap-2 rounded-md border border-border bg-background p-2" aria-hidden="true">
            <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full bg-primary" /><span className="h-1.5 w-12 rounded bg-muted-foreground" /></span>
            <span className="h-5 w-3/4 rounded-md bg-card" />
            <span className="ml-auto h-5 w-2/3 rounded-md bg-primary" />
            <span className="mt-auto h-2 w-full rounded bg-secondary" />
          </span>
          <span className="flex min-h-10 items-center justify-between gap-1 text-left text-sm"><span>{option.label}</span><Check aria-hidden="true" className={theme === option.id ? "shrink-0 text-primary" : "invisible shrink-0"} /></span>
        </Button>)}
      </div>
    </section>
    <BottomNav />
  </main>;
}