export function formatRelativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diff = date.getTime() - Date.now();
  const absDiff = Math.abs(diff);
  if (absDiff < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (absDiff < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (absDiff < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (absDiff < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  return rtf.format(Math.round(diff / 2_592_000_000), "month");
}
