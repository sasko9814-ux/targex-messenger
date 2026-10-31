import { describe, expect, it } from "vitest";
import { appearanceBootScript, normalizeTheme, themes, THEME_KEY } from "@/lib/appearance";
describe("appearance preference", () => {
  it("supports exactly the four requested themes with Premium Dark default", () => {
    expect(themes.map((theme) => theme.name)).toEqual(["Premium Dark", "Modern Blue", "Futuristic Purple", "Light"]);
    expect(normalizeTheme(null)).toBe("premium-dark");
    expect(normalizeTheme("untrusted-value")).toBe("premium-dark");
  });
  it("restores saved Light preference before app rendering", () => {
    localStorage.setItem(THEME_KEY, "light");
    new Function(appearanceBootScript)();
    expect(document.documentElement.dataset["theme"]).toBe("light");
    localStorage.removeItem(THEME_KEY);
  });
});