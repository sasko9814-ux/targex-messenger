import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot } from "lucide-react";
import { aiStatus } from "@/lib/ai.functions";
import { languages, tones, type Lang, type Tone } from "@/lib/ai";
import { langLabels, toneLabels } from "@/lib/ai-i18n";
import { useAiPrefs } from "@/components/ai-prefs";
import { ClearHistory } from "@/components/ai-history";

const sel = "h-10 w-full rounded-md border border-input bg-surface px-2 text-sm";

export function AiSettings({ userId }: { userId: string }) {
  const { prefs, update, t } = useAiPrefs();
  const statusFn = useServerFn(aiStatus);
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => statusFn(), retry: false });
  const ui = prefs.ui;
  return (
    <section className="mt-10" aria-labelledby="ai-heading">
      <h2 id="ai-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-primary" />{t.settings}</h2>
      <div className="space-y-4 rounded-lg border border-border p-4 text-sm">
        <label className="flex items-center justify-between gap-3">{t.enable}
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={prefs.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        </label>
        <label className="block space-y-1"><span>{t.target}</span>
          <select className={sel} value={prefs.target} onChange={(e) => update({ target: e.target.value as Lang })}>
            {languages.map((l) => <option key={l} value={l}>{langLabels[ui][l]}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span>{t.defaultTone}</span>
          <select className={sel} value={prefs.tone} onChange={(e) => update({ tone: e.target.value as Tone })}>
            {tones.map((x) => <option key={x} value={x}>{toneLabels[ui][x]}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span>{t.uiLang}</span>
          <select className={sel} value={prefs.ui} onChange={(e) => update({ ui: e.target.value as "uk" | "en" })}>
            <option value="uk">Українська</option><option value="en">English</option>
          </select>
        </label>
        <p className="flex justify-between"><span>{t.status}</span>
          <span className={status.data?.configured ? "text-primary" : "text-muted-foreground"}>
            {status.isPending ? t.checking : status.data?.configured ? t.ready : t.missing}
          </span>
        </p>
      </div>
      <ClearHistory userId={userId} />
    </section>
  );
}
