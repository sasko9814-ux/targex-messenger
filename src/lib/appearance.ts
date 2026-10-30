export const THEME_KEY = "targex-appearance";
export const themes = [
  { id: "premium-dark", label: "Преміальна темна", name: "Premium Dark" },
  { id: "modern-blue", label: "Сучасна синя", name: "Modern Blue" },
  { id: "futuristic-purple", label: "Футуристична фіолетова", name: "Futuristic Purple" },
  { id: "light", label: "Світла", name: "Light" },
] as const;
export type Theme = (typeof themes)[number]["id"];
export function normalizeTheme(value: string | null): Theme {
  return themes.find((theme) => theme.id === value)?.id ?? "premium-dark";
}
// Runs before styles/paint; only a whitelisted preference reaches the DOM.
export const appearanceBootScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});document.documentElement.dataset.theme=${JSON.stringify(themes.map((t) => t.id))}.includes(t)?t:'premium-dark'}catch{document.documentElement.dataset.theme='premium-dark'}`;