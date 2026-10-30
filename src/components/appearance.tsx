import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { normalizeTheme, THEME_KEY, type Theme } from "@/lib/appearance";

const AppearanceContext = createContext<{ theme: Theme; select: (theme: Theme) => void }>({ theme: "premium-dark", select: () => {} });
export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("premium-dark");
  function apply(value: Theme) {
    document.documentElement.dataset.theme = value;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    setTheme(value);
  }
  useEffect(() => {
    apply(normalizeTheme(document.documentElement.dataset.theme ?? null));
    function sync(event: StorageEvent) {
      if (event.key === THEME_KEY) apply(normalizeTheme(event.newValue));
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function select(value: Theme) {
    apply(value);
    try { localStorage.setItem(THEME_KEY, value); } catch { /* Current tab still uses the selected theme. */ }
  }
  return <AppearanceContext.Provider value={{ theme, select }}>{children}</AppearanceContext.Provider>;
}