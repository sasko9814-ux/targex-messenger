import { useCallback, useEffect, useState } from "react";
import { AI_PREFS_KEY, defaultPrefs, normalizePrefs, type AiPrefs } from "@/lib/ai";
import { aiStrings } from "@/lib/ai-i18n";

const EVENT = "targex-ai-prefs";

/** Local AI preferences (device-only), synced across components and tabs. */
export function useAiPrefs() {
  const [prefs, setPrefs] = useState<AiPrefs>(defaultPrefs);
  useEffect(() => {
    const read = () => {
      try {
        setPrefs(normalizePrefs(JSON.parse(localStorage.getItem(AI_PREFS_KEY) ?? "{}")));
      } catch {
        setPrefs(defaultPrefs);
      }
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const update = useCallback((patch: Partial<AiPrefs>) => {
    setPrefs((old) => {
      const next = normalizePrefs({ ...old, ...patch });
      localStorage.setItem(AI_PREFS_KEY, JSON.stringify(next));
      queueMicrotask(() => window.dispatchEvent(new Event(EVENT)));
      return next;
    });
  }, []);
  return { prefs, update, t: aiStrings[prefs.ui] };
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    f();
    window.addEventListener("online", f);
    window.addEventListener("offline", f);
    return () => {
      window.removeEventListener("online", f);
      window.removeEventListener("offline", f);
    };
  }, []);
  return online;
}
