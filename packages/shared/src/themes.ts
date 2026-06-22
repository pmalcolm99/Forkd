import { z } from "zod";

/**
 * Selectable UI themes. The `id` is the CSS class HeroUI generates for the theme
 * (applied on <html>); `background` is the page background, used for the PWA
 * browser-chrome themeColor so it matches the active theme.
 */
export const THEMES = [
  { id: "dark", label: "Forkd Dark", background: "#0a0a0a", isDark: true },
  { id: "midnight", label: "Midnight", background: "#0b1020", isDark: true },
  { id: "amber", label: "Amber", background: "#161310", isDark: true },
  { id: "plum", label: "Plum", background: "#140d18", isDark: true },
  { id: "light", label: "Forkd Light", background: "#ffffff", isDark: false },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "dark";

export const themeEnum = z.enum(THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]]);

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return !!value && THEME_IDS.has(value);
}

export function getThemeBackground(id: string | null | undefined): string {
  const theme = THEMES.find((t) => t.id === id);
  return theme?.background ?? THEMES[0].background;
}
