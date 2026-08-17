// User-facing release notes shown in the "What's new" popup once per user per
// version. Add an entry (newest first) ONLY when a release adds user-facing
// features — see CHANGELOG_INSTRUCTIONS.md. Skip pure bugfix/backend releases.

export interface ChangelogEntry {
  version: string; // must match package.json version for the release
  highlights: { title: string; description: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.2",
    highlights: [
      {
        title: "Download a bill as a spreadsheet",
        description:
          "On a bill's Share tab, tap Download CSV. You get who owes what, the total in both currencies, the restaurant, the date, and who paid — opens in Excel, Numbers or Google Sheets.",
      },
      {
        title: "Tidier bill screens",
        description:
          "Fixed a big empty gap on the Claim tab, amounts on the Share tab showing the wrong currency, and the guest-link box running off the side of the screen on phones.",
      },
      {
        title: "Better guest pages on iPhone",
        description:
          "The bill name now stays at the top while you scroll, the columns no longer run into each other, and nothing hides behind the bar at the bottom.",
      },
    ],
  },
  {
    version: "1.2.0",
    highlights: [
      {
        title: "Split a bill",
        description:
          "New Bills tab. Photograph a restaurant receipt and Forkd reads the line items for you, then everyone taps what they ordered and sees exactly what they owe.",
      },
      {
        title: "Fair tax and tip",
        description:
          "Choose whether the tip is split evenly or based on what each person ordered — tax and service charge too. Everyone's shares always add up to the receipt total, to the cent.",
      },
      {
        title: "Share a link",
        description:
          'Generate a link (or a QR code to scan at the table) so everyone can pick their own items. There\'s also a "copy for group chat" button.',
      },
      {
        title: "Get paid back",
        description:
          "In Profile, add your Venmo or Cash App handle. When you're the one who paid, everyone else sees a button to send your money back.",
      },
      {
        title: "Travelling? Foreign receipts work too",
        description:
          "If a receipt isn't in dollars, Forkd asks whether to use the day's exchange rate or the total from your bank statement — the statement option matches what you were actually charged.",
      },
    ],
  },
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
