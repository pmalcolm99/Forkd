/** Price levels 1–4 for the filter UI ($ to $$$$). */
export const PRICE_LEVELS = [
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
] as const;

/** "$$$" for a 1–4 level, or null when unknown/out of range. */
export function formatPriceLevel(level: number | null | undefined): string | null {
  if (level == null || level < 1 || level > 4) return null;
  return "$".repeat(level);
}

// New Places API returns priceLevel as a string enum.
const GOOGLE_PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Map Google's PRICE_LEVEL_* enum to 1–4; FREE/unspecified → null. */
export function parseGooglePriceLevel(raw: string | null | undefined): number | null {
  if (!raw) return null;
  return GOOGLE_PRICE_MAP[raw] ?? null;
}
