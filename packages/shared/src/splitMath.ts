/**
 * Bill-splitting math.
 *
 * Pure functions over plain data — no I/O, no React, no @forkd/* imports. This
 * lives in @forkd/shared so the same code runs in the browser (live preview as
 * you edit an invoice), in tRPC procedures, and in the BullMQ worker.
 *
 * Everything is integer cents. There is no floating-point money anywhere in
 * this file: allocation uses the largest-remainder method over exact integer
 * arithmetic, so the parts always sum to the whole, to the cent.
 */

export type AllocationMode = "proportional" | "even";

export interface SplitClaimInput {
  participantId: string;
  /** Relative weight. Two people sharing an appetizer are 1 and 1; someone who
   *  took two of a qty-3 item is 2 against the other person's 1. */
  shares: number;
}

export interface SplitItemInput {
  id: string;
  totalCents: number;
  claims: SplitClaimInput[];
}

export interface SplitMathInput {
  items: SplitItemInput[];
  participantIds: string[];
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  /** Positive number representing a reduction (subtracted from each share). */
  discountCents: number;
  tipMode: AllocationMode;
  /** Governs tax, service charge and discount. */
  taxMode: AllocationMode;
  /** Head count for "even" mode. Defaults to the number of participants. */
  partySize?: number | null;
  /**
   * True when tax is already baked into the item prices, as with VAT/MwSt/IVA
   * almost everywhere outside the US. The receipt still prints a tax figure,
   * but it is a *breakdown* of the subtotal, not an addition to it — so adding
   * it again inflates every share. When set, each person's tax is still
   * reported (it is their share of the VAT they already paid) but is not added
   * to what they owe.
   */
  taxIncluded?: boolean;
}

export interface ShareBreakdown {
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  /** items + tax + service − discount. What you owe before the tip. */
  preTipCents: number;
  /** preTip + tip. What you actually owe. */
  totalCents: number;
}

export interface ParticipantBreakdown extends ShareBreakdown {
  participantId: string;
  /** tip ÷ items, as a percentage. Null when this person claimed nothing. */
  effectiveTipPct: number | null;
}

export interface SplitMathResult {
  participants: ParticipantBreakdown[];
  /** Everything belonging to items nobody has claimed yet. Never silently
   *  redistributed onto whoever claimed first. */
  unassigned: ShareBreakdown;
  itemsSubtotalCents: number;
  claimedSubtotalCents: number;
  unclaimedItemIds: string[];
  /** items + tax + tip + service − discount, computed from the parts. Tax is
   *  omitted when it was already inside the item prices. */
  grandTotalCents: number;
  /** Echoes the input, so callers can label tax as informational. */
  taxIncluded: boolean;
  /** Σ(participant totals) + unassigned.total === grandTotal. Always true; a
   *  false here means a bug in this module, and the UI should say so loudly. */
  balanced: boolean;
}

/**
 * Split `amountCents` across buckets in proportion to `weights`, using the
 * largest-remainder (Hamilton) method so the results sum to exactly
 * `amountCents` — no cent invented, none lost.
 *
 * Uses only integer arithmetic, so there is no float drift to accumulate.
 * Negative amounts (discounts) are handled by allocating the magnitude and
 * flipping the sign back. Zero total weight falls back to an even split.
 */
export function allocateByWeight(amountCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (amountCents === 0) return new Array<number>(n).fill(0);

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? Math.round(w) : 0));
  const totalWeight = safeWeights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    // Nothing to weight by — fall back to an even split so the money still
    // lands somewhere rather than silently vanishing.
    return allocateByWeight(amountCents, new Array<number>(n).fill(1));
  }

  const sign = amountCents < 0 ? -1 : 1;
  const abs = Math.abs(amountCents);

  // Exact integer division: quotient plus the true remainder of abs*w / total.
  const parts = new Array<number>(n);
  const remainders = new Array<number>(n);
  let distributed = 0;
  for (let i = 0; i < n; i++) {
    const w = safeWeights[i] ?? 0;
    const scaled = abs * w;
    const q = Math.floor(scaled / totalWeight);
    parts[i] = q;
    remainders[i] = scaled - q * totalWeight;
    distributed += q;
  }

  // Hand the leftover cents to the largest remainders, ties broken by index so
  // the result is deterministic.
  let leftover = abs - distributed;
  if (leftover > 0) {
    const order = remainders
      .map((rem, i) => ({ i, rem }))
      .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; k < order.length && leftover > 0; k++) {
      const idx = order[k]?.i;
      if (idx === undefined) continue;
      parts[idx] = (parts[idx] ?? 0) + 1;
      leftover--;
    }
  }

  return parts.map((v) => v * sign);
}

/** Split `amountCents` evenly across `count` buckets, exact to the cent. */
export function allocateEvenly(amountCents: number, count: number): number[] {
  if (count <= 0) return [];
  return allocateByWeight(amountCents, new Array<number>(count).fill(1));
}

/**
 * Allocate one ancillary amount (tax, tip, service, discount) across the
 * participants plus the unassigned bucket.
 *
 * Returns `[...perParticipant, unassigned]` — one entry longer than
 * `participantWeights`.
 */
function allocateAncillary(
  amountCents: number,
  mode: AllocationMode,
  participantItemCents: number[],
  unassignedItemCents: number,
  partySize: number | null | undefined
): number[] {
  const n = participantItemCents.length;

  if (mode === "even") {
    // Weight of 1 per seat. If the party is bigger than the people added so
    // far, the missing seats' share waits in `unassigned` rather than being
    // loaded onto whoever happens to be in the list already.
    const seats = partySize && partySize > 0 ? partySize : n;
    const extraSeats = Math.max(0, seats - n);
    if (n === 0 && extraSeats === 0) return [0];
    return allocateByWeight(amountCents, [...new Array<number>(n).fill(1), extraSeats]);
  }

  // Proportional: weight by what each person actually ordered.
  const weights = [...participantItemCents, unassignedItemCents];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    // Nobody has claimed anything yet — hold it all in unassigned rather than
    // splitting a tip nobody has earned a share of.
    return [...new Array<number>(n).fill(0), amountCents];
  }
  return allocateByWeight(amountCents, weights);
}

/**
 * Compute every participant's share of a bill.
 *
 * `grandTotalCents` here is derived from the parts. The caller should compare it
 * against the total printed on the receipt and warn when they disagree — that
 * mismatch is the signal that a line item was misread.
 */
export function computeSplit(input: SplitMathInput): SplitMathResult {
  const participantIds = [...input.participantIds];
  const n = participantIds.length;
  const indexOf = new Map<string, number>(participantIds.map((id, i) => [id, i]));

  const itemCents = new Array<number>(n).fill(0);
  let unassignedItemCents = 0;
  let itemsSubtotalCents = 0;
  let claimedSubtotalCents = 0;
  const unclaimedItemIds: string[] = [];

  for (const item of input.items) {
    itemsSubtotalCents += item.totalCents;

    // Only claims that point at a known participant count.
    const claims = item.claims.filter((c) => indexOf.has(c.participantId) && c.shares > 0);
    if (claims.length === 0) {
      unassignedItemCents += item.totalCents;
      unclaimedItemIds.push(item.id);
      continue;
    }

    claimedSubtotalCents += item.totalCents;
    const parts = allocateByWeight(
      item.totalCents,
      claims.map((c) => c.shares)
    );
    for (let k = 0; k < claims.length; k++) {
      const claim = claims[k];
      if (!claim) continue;
      const idx = indexOf.get(claim.participantId);
      if (idx === undefined) continue;
      itemCents[idx] = (itemCents[idx] ?? 0) + (parts[k] ?? 0);
    }
  }

  const tax = allocateAncillary(
    input.taxCents,
    input.taxMode,
    itemCents,
    unassignedItemCents,
    input.partySize
  );
  const service = allocateAncillary(
    input.serviceCents,
    input.taxMode,
    itemCents,
    unassignedItemCents,
    input.partySize
  );
  const discount = allocateAncillary(
    input.discountCents,
    input.taxMode,
    itemCents,
    unassignedItemCents,
    input.partySize
  );
  const tip = allocateAncillary(
    input.tipCents,
    input.tipMode,
    itemCents,
    unassignedItemCents,
    input.partySize
  );

  // When tax is already inside the item prices, it is reported but never added.
  const taxIncluded = input.taxIncluded === true;
  const addedTax = (cents: number) => (taxIncluded ? 0 : cents);

  const build = (i: number): ShareBreakdown => {
    const items = itemCents[i] ?? 0;
    const t = tax[i] ?? 0;
    const s = service[i] ?? 0;
    const d = discount[i] ?? 0;
    const tp = tip[i] ?? 0;
    const preTip = items + addedTax(t) + s - d;
    return {
      itemsCents: items,
      taxCents: t,
      tipCents: tp,
      serviceCents: s,
      discountCents: d,
      preTipCents: preTip,
      totalCents: preTip + tp,
    };
  };

  const participants: ParticipantBreakdown[] = participantIds.map((participantId, i) => {
    const share = build(i);
    return {
      participantId,
      ...share,
      effectiveTipPct:
        share.itemsCents > 0 ? Math.round((share.tipCents / share.itemsCents) * 1000) / 10 : null,
    };
  });

  // The unassigned bucket is the last slot of every ancillary allocation.
  const unassignedItems = unassignedItemCents;
  const uTax = tax[n] ?? 0;
  const uService = service[n] ?? 0;
  const uDiscount = discount[n] ?? 0;
  const uTip = tip[n] ?? 0;
  const uPreTip = unassignedItems + addedTax(uTax) + uService - uDiscount;
  const unassigned: ShareBreakdown = {
    itemsCents: unassignedItems,
    taxCents: uTax,
    tipCents: uTip,
    serviceCents: uService,
    discountCents: uDiscount,
    preTipCents: uPreTip,
    totalCents: uPreTip + uTip,
  };

  const grandTotalCents =
    itemsSubtotalCents +
    addedTax(input.taxCents) +
    input.tipCents +
    input.serviceCents -
    input.discountCents;

  const summed = participants.reduce((acc, p) => acc + p.totalCents, 0) + unassigned.totalCents;

  return {
    participants,
    unassigned,
    itemsSubtotalCents,
    claimedSubtotalCents,
    unclaimedItemIds,
    grandTotalCents,
    taxIncluded,
    balanced: summed === grandTotalCents,
  };
}

/* -------------------------------------------------------------------------- */
/* Currency conversion                                                         */
/* -------------------------------------------------------------------------- */

export type FxMode = "none" | "rate" | "statement";

/**
 * The rate actually used to convert a receipt to the home currency.
 *
 * In `statement` mode the rate is derived from what the bank actually charged,
 * which is usually the number people care about — it already includes the
 * card's FX markup and any foreign-transaction fee, so the split adds up to
 * the line on the statement rather than to a mid-market approximation.
 */
export function effectiveFxRate(opts: {
  fxMode: FxMode;
  fxRate?: number | null;
  statementTotalCents?: number | null;
  receiptTotalCents: number;
}): number | null {
  if (opts.fxMode === "none") return 1;
  if (opts.fxMode === "rate") {
    return opts.fxRate && opts.fxRate > 0 ? opts.fxRate : null;
  }
  if (!opts.statementTotalCents || opts.receiptTotalCents <= 0) return null;
  return opts.statementTotalCents / opts.receiptTotalCents;
}

/**
 * Convert per-person amounts into the home currency.
 *
 * When an exact target total is known (statement mode), the target is allocated
 * across the people by weight so the converted shares sum to the statement
 * total exactly. Otherwise each amount is converted at the rate and rounded.
 */
export function convertShares(
  perPersonCents: number[],
  opts: { targetTotalCents: number } | { rate: number }
): number[] {
  if ("targetTotalCents" in opts) {
    return allocateByWeight(opts.targetTotalCents, perPersonCents);
  }
  return perPersonCents.map((c) => Math.round(c * opts.rate));
}

/* -------------------------------------------------------------------------- */
/* Money parsing / formatting                                                  */
/* -------------------------------------------------------------------------- */

const MONEY_RE = /^-?\d{1,15}(?:\.\d{1,2})?$/;

/**
 * Parse a decimal money string ("12.99", "-3.5", "40") into integer cents.
 *
 * Deliberately does the arithmetic on the string parts rather than going
 * through parseFloat — `parseFloat("1.15") * 100` is 114.99999999999999.
 * Returns null for anything that isn't a well-formed 2dp amount.
 */
export function moneyStringToCents(raw: string): number | null {
  const s = raw.trim().replace(/[$£€\s,]/g, "");
  if (!MONEY_RE.test(s)) return null;

  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [whole = "0", frac = ""] = body.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Inverse of moneyStringToCents. Always two decimal places, no symbol. */
export function centsToMoneyString(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${s}` : s;
}

/** Locale-formatted money for display, e.g. formatCents(1250, "USD") → "$12.50". */
export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(cents / 100);
  } catch {
    // Unknown/invalid ISO code — fall back to a plain amount plus the code.
    return `${centsToMoneyString(cents)} ${currency}`;
  }
}

export interface MoneyDisplay {
  /** True when amounts are being shown converted into the home currency. */
  converting: boolean;
  /** The code amounts are displayed in — home currency when converting. */
  displayCurrency: string;
  /** Receipt-currency cents → display string, converted if a rate applies. */
  format(cents: number): string;
  /** Receipt-currency cents → string, never converted. */
  formatReceipt(cents: number): string;
  /** Receipt-currency cents → home-currency cents, or null when not converting. */
  toHomeCents(cents: number): number | null;
}

/**
 * One place that decides how a bill's money is displayed.
 *
 * Every screen that shows a share has to answer the same question — is this
 * receipt in a foreign currency, and if so do we show the converted figure? —
 * and every screen answering it separately is how the Share tab ended up
 * printing euros while the rest of the app printed dollars. Build one of these
 * from the bill and format everything through it.
 */
export function moneyDisplay(opts: {
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  locale?: string;
}): MoneyDisplay {
  const rate = opts.effectiveFxRate;
  const converting = rate != null && rate !== 1 && opts.currency !== opts.homeCurrency;
  const toHomeCents = (cents: number) => (converting ? Math.round(cents * rate!) : null);

  return {
    converting,
    displayCurrency: converting ? opts.homeCurrency : opts.currency,
    toHomeCents,
    formatReceipt: (cents) => formatCents(cents, opts.currency, opts.locale),
    format: (cents) => {
      const home = toHomeCents(cents);
      return home == null
        ? formatCents(cents, opts.currency, opts.locale)
        : formatCents(home, opts.homeCurrency, opts.locale);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Quantity expansion                                                          */
/* -------------------------------------------------------------------------- */

export interface ExpandableItem {
  label: string;
  quantity: number;
  unitPriceCents: number | null;
  totalCents: number;
}

/**
 * Split a "3× Schnitzel — 80.70" line into three separately claimable rows.
 *
 * A grouped line can only be claimed as a unit, which forces everyone who had
 * one to share it equally. That happens to be right when all three diners had
 * exactly one, and wrong the moment someone had two — and it gives no way to
 * say so. Individual rows make each unit claimable on its own.
 *
 * The per-unit prices are allocated with the largest-remainder method rather
 * than by dividing, so they always sum back to the original line total even
 * when it doesn't divide evenly (3 × 10.00 from a 30.01 line → 10.01/10.00/10.00).
 *
 * Zero-priced lines (table water, "5× Glas Wasser — 0,00") are left grouped:
 * splitting them adds rows to tap through for no effect on anyone's share.
 */
export function expandItemQuantity(item: ExpandableItem): ExpandableItem[] {
  const qty = Math.round(item.quantity);
  if (!Number.isFinite(qty) || qty <= 1) return [item];
  if (qty > 50) return [item]; // guard against a misread quantity
  if (item.totalCents === 0) return [item];

  const parts = allocateByWeight(item.totalCents, new Array<number>(qty).fill(1));
  return parts.map((cents) => ({
    label: item.label,
    quantity: 1,
    unitPriceCents: cents,
    totalCents: cents,
  }));
}

/** True when this row represents more than one unit and can be split apart. */
export function isExpandable(item: { quantity: number; totalCents: number }): boolean {
  const qty = Math.round(item.quantity);
  return Number.isFinite(qty) && qty > 1 && qty <= 50 && item.totalCents !== 0;
}
