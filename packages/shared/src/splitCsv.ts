import { centsToMoneyString, moneyDisplay, type SplitMathResult } from "./splitMath";

/**
 * CSV export of a bill: who owes what, in both currencies, with the header
 * details (restaurant, date, payer) someone needs to make sense of it a month
 * later.
 *
 * CSV rather than a real spreadsheet file on purpose — Excel, Numbers and
 * Sheets all open it directly, and it needs no dependency. Amounts are written
 * as plain decimal numbers with no currency symbol so they arrive as numbers,
 * not text; the currency is named in the column header instead.
 */

export interface SplitCsvParticipant {
  id: string;
  displayName: string;
  paidAt: Date | string | null;
}

export interface SplitCsvItem {
  label: string;
  quantity: number;
  totalCents: number;
  claims: { participantId: string; shares: number }[];
}

export interface SplitCsvInput {
  title: string;
  merchantName: string | null;
  restaurantName: string | null;
  purchasedAt: Date | string | null;
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  totalCents: number;
  payerName: string | null;
  participants: SplitCsvParticipant[];
  items: SplitCsvItem[];
  math: SplitMathResult;
}

/**
 * Quote a value for CSV, and defuse spreadsheet formula injection.
 *
 * A cell beginning with = + - @ (or a tab/CR, which some versions strip before
 * parsing) is executed as a formula by Excel and Sheets. Line item labels here
 * come from an LLM reading a photograph, so they are untrusted text: a receipt
 * printed with a leading "=" would otherwise become live code in the recipient's
 * spreadsheet. Prefixing with an apostrophe is the standard mitigation — the
 * apostrophe is consumed by the spreadsheet and not shown in the cell.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '""';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function isoDate(d: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Build the CSV text for a bill. Returns the body without a byte-order mark. */
export function buildSplitCsv(input: SplitCsvInput): string {
  const display = moneyDisplay({
    currency: input.currency,
    homeCurrency: input.homeCurrency,
    effectiveFxRate: input.effectiveFxRate,
  });

  // Both currencies are always exported, even when they are the same, so the
  // column layout does not change shape between bills.
  const receipt = (cents: number) => centsToMoneyString(cents);
  const home = (cents: number) => centsToMoneyString(display.toHomeCents(cents) ?? cents);

  const nameById = new Map(input.participants.map((p) => [p.id, p.displayName]));
  const shareById = new Map(input.math.participants.map((p) => [p.participantId, p]));

  const rows: string[] = [];

  rows.push(csvRow(["Forkd — bill split"]));
  rows.push(csvRow(["Bill", input.title]));
  rows.push(csvRow(["Restaurant", input.restaurantName ?? input.merchantName ?? ""]));
  if (input.merchantName && input.restaurantName && input.merchantName !== input.restaurantName) {
    rows.push(csvRow(["Receipt name", input.merchantName]));
  }
  rows.push(csvRow(["Date", isoDate(input.purchasedAt)]));
  rows.push(csvRow(["Paid by", input.payerName ?? "(not recorded)"]));
  rows.push(csvRow(["Receipt currency", input.currency]));
  rows.push(csvRow(["Home currency", input.homeCurrency]));
  rows.push(
    csvRow([
      "Exchange rate",
      display.converting
        ? `1 ${input.currency} = ${input.effectiveFxRate!.toFixed(6)} ${input.homeCurrency}`
        : "n/a",
    ])
  );
  rows.push(csvRow([`Bill total (${input.currency})`, receipt(input.totalCents)]));
  rows.push(csvRow([`Bill total (${input.homeCurrency})`, home(input.totalCents)]));
  rows.push("");

  const taxLabel = input.math.taxIncluded ? "Tax (already in prices)" : "Tax";

  rows.push(csvRow(["Who owes what"]));
  rows.push(
    csvRow([
      "Person",
      `Items (${input.currency})`,
      `${taxLabel} (${input.currency})`,
      `Service (${input.currency})`,
      `Discount (${input.currency})`,
      `Tip (${input.currency})`,
      `Before tip (${input.currency})`,
      `Owes (${input.currency})`,
      `Owes (${input.homeCurrency})`,
      "Settled up",
    ])
  );

  for (const person of input.participants) {
    const s = shareById.get(person.id);
    if (!s) continue;
    rows.push(
      csvRow([
        person.displayName,
        receipt(s.itemsCents),
        receipt(s.taxCents),
        receipt(s.serviceCents),
        receipt(s.discountCents),
        receipt(s.tipCents),
        receipt(s.preTipCents),
        receipt(s.totalCents),
        home(s.totalCents),
        person.paidAt ? "yes" : "no",
      ])
    );
  }

  const un = input.math.unassigned;
  if (un.totalCents !== 0) {
    rows.push(
      csvRow([
        `Unclaimed (${input.math.unclaimedItemIds.length} item${
          input.math.unclaimedItemIds.length === 1 ? "" : "s"
        })`,
        receipt(un.itemsCents),
        receipt(un.taxCents),
        receipt(un.serviceCents),
        receipt(un.discountCents),
        receipt(un.tipCents),
        receipt(un.preTipCents),
        receipt(un.totalCents),
        home(un.totalCents),
        "",
      ])
    );
  }

  rows.push(
    csvRow([
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      receipt(input.math.grandTotalCents),
      home(input.math.grandTotalCents),
      "",
    ])
  );
  rows.push("");

  rows.push(csvRow(["Line items"]));
  rows.push(
    csvRow([
      "Item",
      "Qty",
      `Amount (${input.currency})`,
      `Amount (${input.homeCurrency})`,
      "Claimed by",
      "Split ways",
    ])
  );
  for (const item of input.items) {
    const who = item.claims.map((c) => nameById.get(c.participantId) ?? "Someone");
    rows.push(
      csvRow([
        item.label,
        item.quantity,
        receipt(item.totalCents),
        home(item.totalCents),
        who.length ? who.join("; ") : "(nobody)",
        who.length > 1 ? who.length : "",
      ])
    );
  }

  return rows.join("\r\n") + "\r\n";
}

/** Filename for a bill export, safe for Content-Disposition and every OS. */
export function splitCsvFilename(title: string, purchasedAt: Date | string | null): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "bill";
  const date = isoDate(purchasedAt);
  return `forkd-${slug}${date ? `-${date}` : ""}.csv`;
}
