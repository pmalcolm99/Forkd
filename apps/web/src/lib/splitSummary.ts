import { moneyDisplay, type SplitMathResult } from "@forkd/shared";

interface SummaryInput {
  title: string;
  merchantName?: string | null;
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  totalCents: number;
  participants: { id: string; displayName: string; paidAt: Date | string | null }[];
  math: SplitMathResult;
  payerName?: string | null;
  shareUrl?: string | null;
}

/**
 * A plain-text "who owes what" block for pasting into a group chat.
 *
 * Deliberately unformatted — no tables, no emoji-as-bullets — because it has to
 * survive being pasted into iMessage, WhatsApp, and Signal without turning into
 * a wall of misaligned pipes.
 */
export function buildSplitSummary(input: SummaryInput): string {
  // The group-chat text shows both figures — it gets pasted somewhere with no
  // context, so "$38.25 (€33.00)" saves an argument later.
  const display = moneyDisplay({
    currency: input.currency,
    homeCurrency: input.homeCurrency,
    effectiveFxRate: input.effectiveFxRate,
  });
  const money = (cents: number) => {
    const base = display.formatReceipt(cents);
    return display.converting ? `${display.format(cents)} (${base})` : base;
  };

  const lines: string[] = [];
  lines.push(input.merchantName ? `${input.title} — ${input.merchantName}` : input.title);
  lines.push(`Total: ${money(input.totalCents)}`);
  if (input.payerName) lines.push(`Paid by: ${input.payerName}`);
  lines.push("");

  const byId = new Map(input.math.participants.map((p) => [p.participantId, p]));
  for (const person of input.participants) {
    const share = byId.get(person.id);
    if (!share || share.totalCents === 0) continue;
    const paid = person.paidAt ? " (paid)" : "";
    lines.push(`${person.displayName}: ${money(share.totalCents)}${paid}`);
  }

  if (input.math.unassigned.totalCents > 0) {
    lines.push("");
    lines.push(`Still unclaimed: ${money(input.math.unassigned.totalCents)}`);
  }

  if (input.shareUrl) {
    lines.push("");
    lines.push(`Pick your items: ${input.shareUrl}`);
  }

  return lines.join("\n");
}
