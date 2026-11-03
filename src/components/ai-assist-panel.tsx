import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Sparkle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aiAssist } from "@/lib/ai.functions";
import { AI_CONTEXT_MESSAGES_MAX, languages, tones, type AssistInput, type Lang, type Tone } from "@/lib/ai";
import { errorLabels, langLabels, toneLabels } from "@/lib/ai-i18n";
import { useAiPrefs, useOnline } from "@/components/ai-prefs";

type Action = AssistInput["action"];
export type ContextMsg = { id: string; mine: boolean; text: string };

const sel = "h-9 rounded-md border border-input bg-surface px-2 text-sm";

export function AiAssistPanel({
  draft,
  context,
  onInsert,
  onClose,
}: {
  draft: string;
  context: ContextMsg[];
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const { prefs, t } = useAiPrefs();
  const online = useOnline();
  const run = useServerFn(aiAssist);
  const [action, setAction] = useState<Action>("replies");
  const [tone, setTone] = useState<Tone | null>(null);
  const [target, setTarget] = useState<Lang | null>(null);
  const recent = context.slice(-AI_CONTEXT_MESSAGES_MAX);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ui = prefs.ui;
  const curTone = tone ?? prefs.tone;
  const curTarget = target ?? prefs.target;
  const chosen = recent.filter((m) => (picked ?? recent.map((r) => r.id)).includes(m.id));
  const needsDraft = action === "rewrite" || action === "grammar" || action === "translate";

  async function go() {
    setError(null);
    setResults([]);
    if (needsDraft && !draft.trim()) return setError(t.draftNeeded);
    const ctx = (action === "replies" ? recent : chosen).map((m) => ({ mine: m.mine, text: m.text.slice(0, 4000) }));
    if (!needsDraft && !ctx.length) return setError(t.noMessages);
    const text = draft.trim().slice(0, 4000);
    const input: AssistInput =
      action === "replies"
        ? { action, tone: curTone, context: ctx }
        : action === "summarize"
          ? { action, context: ctx }
          : action === "rewrite"
            ? { action, tone: curTone, text }
            : action === "grammar"
              ? { action, text }
              : { action, target: curTarget, text };
    setBusy(true);
    try {
      const r = await run({ data: input });
      if (r.ok) setResults(r.data);
      else setError(errorLabels[ui][r.error]);
    } catch {
      setError(errorLabels[ui].provider);
    } finally {
      setBusy(false);
    }
  }

  const actions: Action[] = ["replies", "rewrite", "grammar", "translate", "summarize"];
  return (
    <section aria-label={t.open} className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkle className="h-4 w-4 text-primary" />
          {t.ai} <span className="text-xs font-normal text-muted-foreground">· {t.aiLabel}</span>
        </p>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={t.cancel} onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {!prefs.enabled ? (
        <p className="text-sm text-muted-foreground">{t.disabled}</p>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
            {actions.map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                role="tab"
                aria-selected={action === a}
                variant={action === a ? "default" : "outline"}
                onClick={() => {
                  setAction(a);
                  setResults([]);
                  setError(null);
                }}
                className="shrink-0 rounded-full"
              >
                {t[a]}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(action === "replies" || action === "rewrite") && (
              <select aria-label={t.tone} className={sel} value={curTone} onChange={(e) => setTone(e.target.value as Tone)}>
                {tones.map((x) => (
                  <option key={x} value={x}>{toneLabels[ui][x]}</option>
                ))}
              </select>
            )}
            {action === "translate" && (
              <select aria-label={t.target} className={sel} value={curTarget} onChange={(e) => setTarget(e.target.value as Lang)}>
                {languages.map((x) => (
                  <option key={x} value={x}>{langLabels[ui][x]}</option>
                ))}
              </select>
            )}
            <Button type="button" size="sm" onClick={() => void go()} disabled={busy || !online} className="ml-auto">
              {busy && <Loader2 className="animate-spin" />} {t.run}
            </Button>
          </div>
          {action === "summarize" && (
            <fieldset className="mt-2 max-h-32 overflow-y-auto text-sm">
              <legend className="mb-1 text-xs text-muted-foreground">{t.pickMessages}</legend>
              {recent.length === 0 && <p className="text-muted-foreground">{t.noMessages}</p>}
              {recent.map((m) => (
                <label key={m.id} className="flex items-start gap-2 py-0.5">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={chosen.some((c) => c.id === m.id)}
                    onChange={(e) => {
                      const cur = picked ?? recent.map((r) => r.id);
                      setPicked(e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id));
                    }}
                  />
                  <span className="line-clamp-1">{m.mine ? t.you : "→"}: {m.text}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!online && <p className="mt-2 text-sm text-destructive">{t.offline}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          {results.length > 0 && (
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {results.map((r, i) => (
                <li key={i} className="rounded-md border border-border bg-surface p-2 text-sm">
                  <p className="whitespace-pre-wrap break-words">{r}</p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void navigator.clipboard.writeText(r).then(() => toast.success(t.copied))}
                    >
                      <Copy /> {t.copy}
                    </Button>
                    {action !== "summarize" && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => onInsert(r)}>
                        {t.insert}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{t.disclosure}</p>
        </>
      )}
    </section>
  );
}
