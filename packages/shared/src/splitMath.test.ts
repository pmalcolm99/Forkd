import { describe, expect, it } from "vitest";
import {
  allocateByWeight,
  allocateEvenly,
  centsToMoneyString,
  computeSplit,
  convertShares,
  expandItemQuantity,
  isExpandable,
  effectiveFxRate,
  formatCents,
  moneyDisplay,
  moneyStringToCents,
  type SplitMathInput,
} from "./splitMath";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function baseInput(overrides: Partial<SplitMathInput> = {}): SplitMathInput {
  return {
    items: [],
    participantIds: [],
    taxCents: 0,
    tipCents: 0,
    serviceCents: 0,
    discountCents: 0,
    tipMode: "proportional",
    taxMode: "proportional",
    partySize: null,
    ...overrides,
  };
}

describe("allocateByWeight", () => {
  it("splits exactly when it divides evenly", () => {
    expect(allocateByWeight(1000, [1, 1])).toEqual([500, 500]);
  });

  it("distributes indivisible cents by largest remainder, never losing one", () => {
    const parts = allocateByWeight(1001, [1, 1, 1]);
    expect(sum(parts)).toBe(1001);
    expect(parts).toEqual([334, 334, 333]);
  });

  it("respects unequal weights", () => {
    expect(allocateByWeight(300, [2, 1])).toEqual([200, 100]);
  });

  it("is exact for adversarial amounts across many splits", () => {
    for (const amount of [1, 2, 7, 99, 101, 1234, 99999, 1000003]) {
      for (const n of [2, 3, 6, 7, 11]) {
        const parts = allocateByWeight(amount, new Array<number>(n).fill(1));
        expect(sum(parts), `${amount} / ${n}`).toBe(amount);
        // No bucket differs from another by more than a cent.
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("handles negative amounts (discounts) exactly", () => {
    const parts = allocateByWeight(-1000, [1, 1, 1]);
    expect(sum(parts)).toBe(-1000);
  });

  it("falls back to an even split when all weights are zero", () => {
    const parts = allocateByWeight(900, [0, 0, 0]);
    expect(parts).toEqual([300, 300, 300]);
  });

  it("returns zeros for a zero amount and an empty array for no buckets", () => {
    expect(allocateByWeight(0, [1, 2])).toEqual([0, 0]);
    expect(allocateByWeight(500, [])).toEqual([]);
  });

  it("allocateEvenly matches an equal-weight allocation", () => {
    expect(allocateEvenly(1000, 3)).toEqual(allocateByWeight(1000, [1, 1, 1]));
    expect(allocateEvenly(1000, 0)).toEqual([]);
  });
});

describe("computeSplit — items", () => {
  it("assigns a solely-claimed item to its claimant", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b"],
        items: [{ id: "i1", totalCents: 1200, claims: [{ participantId: "a", shares: 1 }] }],
      })
    );
    expect(r.participants[0]?.itemsCents).toBe(1200);
    expect(r.participants[1]?.itemsCents).toBe(0);
    expect(r.unassigned.itemsCents).toBe(0);
    expect(r.balanced).toBe(true);
  });

  it("splits a shared item evenly between co-claimants", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b"],
        items: [
          {
            id: "app",
            totalCents: 1500,
            claims: [
              { participantId: "a", shares: 1 },
              { participantId: "b", shares: 1 },
            ],
          },
        ],
      })
    );
    expect(r.participants.map((p) => p.itemsCents)).toEqual([750, 750]);
  });

  it("splits an odd shared item to the cent", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b", "c"],
        items: [
          {
            id: "app",
            totalCents: 1001,
            claims: [
              { participantId: "a", shares: 1 },
              { participantId: "b", shares: 1 },
              { participantId: "c", shares: 1 },
            ],
          },
        ],
      })
    );
    expect(sum(r.participants.map((p) => p.itemsCents))).toBe(1001);
    expect(r.balanced).toBe(true);
  });

  it("weights by shares for quantity splitting (2 of 3 vs 1 of 3)", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b"],
        items: [
          {
            id: "beers",
            totalCents: 1800,
            claims: [
              { participantId: "a", shares: 2 },
              { participantId: "b", shares: 1 },
            ],
          },
        ],
      })
    );
    expect(r.participants.map((p) => p.itemsCents)).toEqual([1200, 600]);
  });

  it("puts unclaimed items in the unassigned bucket and lists their ids", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a"],
        items: [
          { id: "i1", totalCents: 1000, claims: [{ participantId: "a", shares: 1 }] },
          { id: "i2", totalCents: 500, claims: [] },
        ],
      })
    );
    expect(r.unassigned.itemsCents).toBe(500);
    expect(r.unclaimedItemIds).toEqual(["i2"]);
    expect(r.claimedSubtotalCents).toBe(1000);
    expect(r.itemsSubtotalCents).toBe(1500);
  });

  it("ignores claims pointing at a participant who was removed", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a"],
        items: [{ id: "i1", totalCents: 900, claims: [{ participantId: "ghost", shares: 1 }] }],
      })
    );
    expect(r.unassigned.itemsCents).toBe(900);
    expect(r.balanced).toBe(true);
  });
});

describe("computeSplit — tip and tax allocation", () => {
  const twoPeopleUnequal = () =>
    baseInput({
      participantIds: ["a", "b"],
      items: [
        { id: "i1", totalCents: 3000, claims: [{ participantId: "a", shares: 1 }] },
        { id: "i2", totalCents: 1000, claims: [{ participantId: "b", shares: 1 }] },
      ],
    });

  it("proportional tip follows what each person ordered", () => {
    const r = computeSplit({ ...twoPeopleUnequal(), tipCents: 800, tipMode: "proportional" });
    expect(r.participants.map((p) => p.tipCents)).toEqual([600, 200]);
  });

  it("even tip ignores what each person ordered", () => {
    const r = computeSplit({ ...twoPeopleUnequal(), tipCents: 800, tipMode: "even" });
    expect(r.participants.map((p) => p.tipCents)).toEqual([400, 400]);
  });

  it("even tip with a party size larger than the people added holds back the empty seats", () => {
    const r = computeSplit({
      ...twoPeopleUnequal(),
      tipCents: 800,
      tipMode: "even",
      partySize: 4,
    });
    expect(r.participants.map((p) => p.tipCents)).toEqual([200, 200]);
    expect(r.unassigned.tipCents).toBe(400);
    expect(r.balanced).toBe(true);
  });

  it("tip and tax modes are independent", () => {
    const r = computeSplit({
      ...twoPeopleUnequal(),
      taxCents: 400,
      taxMode: "proportional",
      tipCents: 800,
      tipMode: "even",
    });
    expect(r.participants.map((p) => p.taxCents)).toEqual([300, 100]);
    expect(r.participants.map((p) => p.tipCents)).toEqual([400, 400]);
  });

  it("does not redistribute an unclaimed item's tip onto whoever claimed first", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a"],
        items: [
          { id: "i1", totalCents: 1000, claims: [{ participantId: "a", shares: 1 }] },
          { id: "i2", totalCents: 1000, claims: [] },
        ],
        tipCents: 400,
      })
    );
    expect(r.participants[0]?.tipCents).toBe(200);
    expect(r.unassigned.tipCents).toBe(200);
  });

  it("holds the whole tip in unassigned when nobody has claimed anything", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b"],
        items: [{ id: "i1", totalCents: 1000, claims: [] }],
        tipCents: 300,
      })
    );
    expect(r.participants.map((p) => p.tipCents)).toEqual([0, 0]);
    expect(r.unassigned.tipCents).toBe(300);
  });

  it("subtracts a discount rather than adding it", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a"],
        items: [{ id: "i1", totalCents: 2000, claims: [{ participantId: "a", shares: 1 }] }],
        discountCents: 500,
      })
    );
    expect(r.participants[0]?.discountCents).toBe(500);
    expect(r.participants[0]?.totalCents).toBe(1500);
    expect(r.grandTotalCents).toBe(1500);
  });
});

describe("computeSplit — totals", () => {
  it("reports pre-tip and post-tip totals separately", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a"],
        items: [{ id: "i1", totalCents: 2000, claims: [{ participantId: "a", shares: 1 }] }],
        taxCents: 160,
        serviceCents: 100,
        tipCents: 400,
      })
    );
    const p = r.participants[0];
    expect(p?.preTipCents).toBe(2260);
    expect(p?.totalCents).toBe(2660);
  });

  it("reports an effective tip percentage, or null when nothing was claimed", () => {
    const r = computeSplit(
      baseInput({
        participantIds: ["a", "b"],
        items: [{ id: "i1", totalCents: 2000, claims: [{ participantId: "a", shares: 1 }] }],
        tipCents: 400,
      })
    );
    expect(r.participants[0]?.effectiveTipPct).toBe(20);
    expect(r.participants[1]?.effectiveTipPct).toBeNull();
  });

  it("always balances across a spread of awkward inputs", () => {
    const modes: ("proportional" | "even")[] = ["proportional", "even"];
    for (const tipMode of modes) {
      for (const taxMode of modes) {
        for (const tip of [0, 1, 7, 733, 1999]) {
          const r = computeSplit(
            baseInput({
              participantIds: ["a", "b", "c"],
              items: [
                {
                  id: "i1",
                  totalCents: 1001,
                  claims: [
                    { participantId: "a", shares: 1 },
                    { participantId: "b", shares: 2 },
                  ],
                },
                { id: "i2", totalCents: 333, claims: [{ participantId: "c", shares: 1 }] },
                { id: "i3", totalCents: 77, claims: [] },
              ],
              taxCents: 137,
              serviceCents: 91,
              discountCents: 53,
              tipCents: tip,
              tipMode,
              taxMode,
              partySize: 5,
            })
          );
          const label = `${tipMode}/${taxMode}/${tip}`;
          expect(r.balanced, label).toBe(true);
          const total = sum(r.participants.map((p) => p.totalCents)) + r.unassigned.totalCents;
          expect(total, label).toBe(r.grandTotalCents);
        }
      }
    }
  });

  it("handles a bill with no participants at all", () => {
    const r = computeSplit(
      baseInput({
        participantIds: [],
        items: [{ id: "i1", totalCents: 1000, claims: [] }],
        tipCents: 200,
      })
    );
    expect(r.participants).toEqual([]);
    expect(r.unassigned.totalCents).toBe(1200);
    expect(r.balanced).toBe(true);
  });
});

describe("tax already included in the item prices (VAT / MwSt / IVA)", () => {
  // Modelled on the real Austrian receipt that surfaced this: item lines total
  // €122.20, the MWSt breakdown shows €12.01 of that is tax, and a 10% tip of
  // €12.22 brings the card charge to €134.42 — NOT €146.43.
  const austrian = () =>
    baseInput({
      participantIds: ["a", "b"],
      items: [
        { id: "i1", totalCents: 8070, claims: [{ participantId: "a", shares: 1 }] },
        { id: "i2", totalCents: 4150, claims: [{ participantId: "b", shares: 1 }] },
      ],
      taxCents: 1201,
      tipCents: 1222,
      taxIncluded: true,
    });

  it("does not add the tax again — the grand total matches the receipt", () => {
    const r = computeSplit(austrian());
    expect(r.grandTotalCents).toBe(13442);
  });

  it("would have overcharged by exactly the tax if treated as additional", () => {
    const wrong = computeSplit({ ...austrian(), taxIncluded: false });
    expect(wrong.grandTotalCents).toBe(14643);
    expect(wrong.grandTotalCents - 13442).toBe(1201);
  });

  it("still reports each person's share of the tax, for information", () => {
    const r = computeSplit(austrian());
    const shares = r.participants.map((p) => p.taxCents);
    expect(sum(shares)).toBe(1201); // allocated, just not charged
    expect(shares[0]).toBeGreaterThan(0);
  });

  it("excludes the reported tax from what each person owes", () => {
    const r = computeSplit(austrian());
    const a = r.participants[0]!;
    // items + tip only; the tax sits inside itemsCents already.
    expect(a.totalCents).toBe(a.itemsCents + a.tipCents);
    expect(a.preTipCents).toBe(a.itemsCents);
  });

  it("still balances exactly", () => {
    const r = computeSplit(austrian());
    expect(r.balanced).toBe(true);
    expect(sum(r.participants.map((p) => p.totalCents)) + r.unassigned.totalCents).toBe(
      r.grandTotalCents
    );
  });

  it("echoes the flag so the UI can label tax as informational", () => {
    expect(computeSplit(austrian()).taxIncluded).toBe(true);
    expect(computeSplit(baseInput()).taxIncluded).toBe(false);
  });

  it("keeps service charge and discount chargeable — only tax is inclusive", () => {
    const r = computeSplit({
      ...austrian(),
      serviceCents: 500,
      discountCents: 200,
    });
    expect(r.grandTotalCents).toBe(13442 + 500 - 200);
  });

  it("balances with an unclaimed item too", () => {
    const r = computeSplit({
      ...austrian(),
      items: [...austrian().items, { id: "i3", totalCents: 690, claims: [] }],
    });
    expect(r.balanced).toBe(true);
    expect(r.unassigned.itemsCents).toBe(690);
  });
});

describe("expandItemQuantity", () => {
  it("splits a 3x line into three individually claimable rows", () => {
    const parts = expandItemQuantity({
      label: "Wiener v.Kalb",
      quantity: 3,
      unitPriceCents: 2690,
      totalCents: 8070,
    });
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.totalCents)).toEqual([2690, 2690, 2690]);
    expect(parts.every((p) => p.quantity === 1)).toBe(true);
    expect(parts.every((p) => p.label === "Wiener v.Kalb")).toBe(true);
  });

  it("keeps the parts summing to the original line total when it doesn't divide", () => {
    const parts = expandItemQuantity({
      label: "Beer",
      quantity: 3,
      unitPriceCents: null,
      totalCents: 1000,
    });
    expect(sum(parts.map((p) => p.totalCents))).toBe(1000);
    expect(parts.map((p) => p.totalCents)).toEqual([334, 333, 333]);
  });

  it("leaves a single item alone", () => {
    const one = { label: "Gulasch", quantity: 1, unitPriceCents: 1280, totalCents: 1280 };
    expect(expandItemQuantity(one)).toEqual([one]);
  });

  it("leaves free items grouped — 5 rows of nothing is just noise", () => {
    const water = { label: "Glas Wasser", quantity: 5, unitPriceCents: 0, totalCents: 0 };
    expect(expandItemQuantity(water)).toEqual([water]);
  });

  it("refuses an implausible quantity rather than making 900 rows", () => {
    const bad = { label: "Misread", quantity: 900, unitPriceCents: 1, totalCents: 900 };
    expect(expandItemQuantity(bad)).toEqual([bad]);
  });

  it("isExpandable agrees with what expandItemQuantity will actually do", () => {
    expect(isExpandable({ quantity: 3, totalCents: 8070 })).toBe(true);
    expect(isExpandable({ quantity: 1, totalCents: 1280 })).toBe(false);
    expect(isExpandable({ quantity: 5, totalCents: 0 })).toBe(false);
    expect(isExpandable({ quantity: 900, totalCents: 900 })).toBe(false);
  });
});

describe("currency conversion", () => {
  it("returns 1 when there is nothing to convert", () => {
    expect(effectiveFxRate({ fxMode: "none", receiptTotalCents: 5000 })).toBe(1);
  });

  it("uses the supplied rate in rate mode", () => {
    expect(effectiveFxRate({ fxMode: "rate", fxRate: 1.08, receiptTotalCents: 5000 })).toBe(1.08);
    expect(effectiveFxRate({ fxMode: "rate", fxRate: 0, receiptTotalCents: 5000 })).toBeNull();
    expect(effectiveFxRate({ fxMode: "rate", receiptTotalCents: 5000 })).toBeNull();
  });

  it("derives the rate from the statement total, markup included", () => {
    // €50.00 on the receipt showed up as $56.25 on the statement.
    const rate = effectiveFxRate({
      fxMode: "statement",
      statementTotalCents: 5625,
      receiptTotalCents: 5000,
    });
    expect(rate).toBeCloseTo(1.125, 10);
  });

  it("returns null for statement mode with no usable numbers", () => {
    expect(
      effectiveFxRate({ fxMode: "statement", statementTotalCents: 5625, receiptTotalCents: 0 })
    ).toBeNull();
    expect(effectiveFxRate({ fxMode: "statement", receiptTotalCents: 5000 })).toBeNull();
  });

  it("converts by rate", () => {
    expect(convertShares([1000, 2000], { rate: 1.08 })).toEqual([1080, 2160]);
  });

  it("converts to an exact statement total with no cent lost", () => {
    const converted = convertShares([1000, 2000, 3000], { targetTotalCents: 6751 });
    expect(sum(converted)).toBe(6751);
  });
});

describe("money parsing and formatting", () => {
  it("parses plain amounts without float error", () => {
    expect(moneyStringToCents("12.99")).toBe(1299);
    expect(moneyStringToCents("1.15")).toBe(115); // parseFloat("1.15")*100 is 114.999…
    expect(moneyStringToCents("40")).toBe(4000);
    expect(moneyStringToCents("0.5")).toBe(50);
    expect(moneyStringToCents("-3.50")).toBe(-350);
  });

  it("tolerates currency symbols, thousands separators and whitespace", () => {
    expect(moneyStringToCents(" $1,234.50 ")).toBe(123450);
    expect(moneyStringToCents("€9.99")).toBe(999);
  });

  it("rejects anything that is not a well-formed amount", () => {
    for (const bad of ["", "abc", "1.234", "1.2.3", "--5", "1e3", "."]) {
      expect(moneyStringToCents(bad), bad).toBeNull();
    }
  });

  it("round-trips through centsToMoneyString", () => {
    for (const cents of [0, 5, 50, 999, 100000, -1250]) {
      expect(moneyStringToCents(centsToMoneyString(cents))).toBe(cents);
    }
    expect(centsToMoneyString(1299)).toBe("12.99");
    expect(centsToMoneyString(5)).toBe("0.05");
  });

  it("formats for display", () => {
    expect(formatCents(1250, "USD")).toContain("12.50");
    // Intl accepts any well-formed ISO code and uses it in place of a symbol.
    expect(formatCents(1250, "ZZZ")).toContain("12.50");
  });

  it("falls back rather than throwing on a malformed currency code", () => {
    // Intl throws RangeError for anything that isn't three letters.
    expect(formatCents(1250, "US")).toBe("12.50 US");
  });
});

describe("moneyDisplay", () => {
  const eur = { currency: "EUR", homeCurrency: "USD", effectiveFxRate: 1.16 };

  it("converts into the home currency when a rate applies", () => {
    const d = moneyDisplay(eur);
    expect(d.converting).toBe(true);
    expect(d.displayCurrency).toBe("USD");
    expect(d.toHomeCents(1000)).toBe(1160);
    expect(d.format(1000)).toContain("11.60");
  });

  it("still exposes the untouched receipt figure", () => {
    const d = moneyDisplay(eur);
    expect(d.formatReceipt(1000)).toContain("10.00");
    expect(d.formatReceipt(1000)).not.toContain("11.60");
  });

  // These three are the conditions the old copy-pasted checks disagreed on —
  // one screen printed euros while every other screen printed dollars.
  it("does not convert when the rate is exactly 1", () => {
    const d = moneyDisplay({ ...eur, effectiveFxRate: 1 });
    expect(d.converting).toBe(false);
    expect(d.toHomeCents(1000)).toBeNull();
    expect(d.format(1000)).toBe(d.formatReceipt(1000));
  });

  it("does not convert when the rate is unknown", () => {
    const d = moneyDisplay({ ...eur, effectiveFxRate: null });
    expect(d.converting).toBe(false);
    expect(d.format(1000)).toBe(d.formatReceipt(1000));
  });

  it("does not convert when the receipt is already in the home currency", () => {
    const d = moneyDisplay({ currency: "USD", homeCurrency: "USD", effectiveFxRate: 1.16 });
    expect(d.converting).toBe(false);
    expect(d.displayCurrency).toBe("USD");
    expect(d.format(1000)).toContain("10.00");
  });

  it("rounds each amount to a whole cent", () => {
    const d = moneyDisplay({ ...eur, effectiveFxRate: 1.155 });
    expect(d.toHomeCents(333)).toBe(385); // 384.615 → 385
  });
});
