// User-facing release notes shown in the "What's new" popup once per user per
// version. Add an entry (newest first) ONLY when a release adds user-facing
// features — see CHANGELOG_INSTRUCTIONS.md. Skip pure bugfix/backend releases.

export interface ChangelogEntry {
  version: string; // must match package.json version for the release
  highlights: { title: string; description: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    highlights: [
      {
        title: "Choose how the map opens",
        description:
          "In Profile → Default map view, pick Current location (the map centers on you) or Home state. Current location asks for permission once and remembers it for a while.",
      },
      {
        title: "Quick home-state filter on the map",
        description:
          "The map now has the same one-tap home-state chip as the restaurants list, instead of always forcing that filter.",
      },
      {
        title: "Save your default filters",
        description:
          "Set the filters that apply automatically on the Restaurants and Map pages in Profile → Default filters. Use “Modify defaults” on any filter menu to jump there.",
      },
      {
        title: "Smaller, faster photos",
        description:
          "New photos are optimized automatically. Owners can also shrink existing photos from Admin → Storage, with the option to revert.",
      },
      {
        title: "Tidier restaurant page",
        description:
          "Delete now lives inside the Edit menu on a restaurant, so it’s out of the way until you need it.",
      },
    ],
  },
];

/** True if version `a` is strictly newer than `b` (dotted numeric semver). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Changelog entries newer than the version the user last saw (null = all). */
export function unseenChangelog(lastSeen: string | null | undefined): ChangelogEntry[] {
  return CHANGELOG.filter((e) => !lastSeen || isNewer(e.version, lastSeen));
}
