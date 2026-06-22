import { THEMES } from "@forkd/shared";

/**
 * Swap the active theme class on <html> for instant client-side preview. The
 * server re-renders the same class on the next load/refresh (single source of
 * truth = the user's saved theme), so this just avoids a flash before save.
 */
export function applyTheme(themeId: string): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  THEMES.forEach((t) => el.classList.remove(t.id));
  el.classList.add(themeId);
}
