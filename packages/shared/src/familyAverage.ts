export function formatFamilyAverage(
  avg: number | null,
  count: number
): { display: string; ariaLabel: string } {
  if (avg == null || count === 0) {
    return { display: "No ratings yet", ariaLabel: "No ratings yet" };
  }
  const plural = count === 1 ? "" : "s";
  return {
    display: `★ ${avg.toFixed(1)} (${count})`,
    ariaLabel: `Average rating ${avg.toFixed(1)} stars from ${count} family member${plural}`,
  };
}
