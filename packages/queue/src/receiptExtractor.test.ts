import { describe, expect, it } from "vitest";
import { receiptExtractionSchema, toCents } from "./pipeline/receiptExtractor";

const valid = {
  merchantName: "Casa Bonita",
  purchasedAt: "2026-08-14",
  currency: "USD",
  items: [
    { label: "Sopapillas", quantity: 1, unitPrice: "6.50", total: "6.50" },
    { label: "Tacos", quantity: 2, unitPrice: "7.00", total: "14.00" },
  ],
  subtotal: "20.50",
  tax: "1.64",
  tip: "4.10",
  serviceCharge: null,
  discount: null,
  total: "26.24",
  confidence: "high" as const,
};

describe("receiptExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    const r = receiptExtractionSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("defaults currency to USD when absent", () => {
    const { currency, ...rest } = valid;
    void currency;
    const r = receiptExtractionSchema.safeParse(rest);
    expect(r.success && r.data.currency).toBe("USD");
  });

  it("defaults quantity to 1", () => {
    const r = receiptExtractionSchema.safeParse({
      ...valid,
      items: [{ label: "Coffee", total: "3.00" }],
    });
    expect(r.success && r.data.items[0]?.quantity).toBe(1);
  });

  it("rejects a numeric amount — money must be a decimal string", () => {
    const r = receiptExtractionSchema.safeParse({
      ...valid,
      items: [{ label: "Coffee", quantity: 1, unitPrice: null, total: 3.0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed amount", () => {
    for (const bad of ["3.001", "three", "$3.00 USD", ""]) {
      const r = receiptExtractionSchema.safeParse({
        ...valid,
        items: [{ label: "Coffee", quantity: 1, unitPrice: null, total: bad }],
      });
      expect(r.success, bad).toBe(false);
    }
  });

  it("rejects a malformed date rather than guessing", () => {
    const r = receiptExtractionSchema.safeParse({ ...valid, purchasedAt: "Aug 14 2026" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing confidence", () => {
    const { confidence, ...rest } = valid;
    void confidence;
    const r = receiptExtractionSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects an item with no label", () => {
    const r = receiptExtractionSchema.safeParse({
      ...valid,
      items: [{ label: "", quantity: 1, unitPrice: null, total: "3.00" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty item list (a receipt Claude could not itemize)", () => {
    const r = receiptExtractionSchema.safeParse({ ...valid, items: [] });
    expect(r.success).toBe(true);
  });
});

describe("toCents", () => {
  const parsed = receiptExtractionSchema.parse(valid);

  it("splits a multi-quantity line into individually claimable rows", () => {
    const c = toCents(parsed);
    const tacos = c.items.filter((i) => i.label === "Tacos");
    expect(tacos).toHaveLength(2);
    expect(tacos.every((t) => t.quantity === 1)).toBe(true);
    expect(tacos.reduce((a, t) => a + t.totalCents, 0)).toBe(1400);
  });

  it("converts every amount to integer cents", () => {
    const c = toCents(parsed);
    // The qty-2 tacos line is expanded into two individually claimable rows.
    expect(c.items.map((i) => i.totalCents)).toEqual([650, 700, 700]);
    expect(c.items[1]?.unitPriceCents).toBe(700);
    expect(c.subtotalCents).toBe(2050);
    expect(c.taxCents).toBe(164);
    expect(c.tipCents).toBe(410);
    expect(c.totalCents).toBe(2624);
  });

  it("parses the date at midday UTC so timezones cannot shift the day", () => {
    const c = toCents(parsed);
    expect(c.purchasedAt?.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("treats missing money lines as zero", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, tax: null, tip: null }));
    expect(c.taxCents).toBe(0);
    expect(c.tipCents).toBe(0);
  });

  it("falls back to the sum of items when there is no subtotal line", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, subtotal: null }));
    expect(c.subtotalCents).toBe(2050);
  });

  it("computes a grand total when the receipt has no total line", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, total: null }));
    expect(c.totalCents).toBe(2050 + 164 + 410);
  });

  it("normalises a negative discount to a positive reduction", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, discount: "-5.00" }));
    expect(c.discountCents).toBe(500);
  });

  it("upper-cases the currency code", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, currency: "eur" }));
    expect(c.currency).toBe("EUR");
  });

  it("nulls out an empty merchant name", () => {
    const c = toCents(receiptExtractionSchema.parse({ ...valid, merchantName: "   " }));
    expect(c.merchantName).toBeNull();
  });

  it("detects VAT-inclusive tax from the receipt's own arithmetic", () => {
    // The real Austrian case: 122.20 items + 12.22 tip = 134.42. The 12.01 of
    // MWSt is inside the 122.20, so adding it would give 146.43.
    const austrian = receiptExtractionSchema.parse({
      ...valid,
      items: [{ label: "Wiener", quantity: 1, unitPrice: null, total: "122.20" }],
      subtotal: "122.20",
      tax: "12.01",
      tip: "12.22",
      total: "134.42",
      taxIncludedInSubtotal: false, // model got it WRONG; arithmetic must win
    });
    const c = toCents(austrian);
    expect(c.taxIncluded).toBe(true);
    expect(c.totalCents).toBe(13442);
  });

  it("detects US-style additive tax from the arithmetic", () => {
    const us = receiptExtractionSchema.parse({
      ...valid,
      taxIncludedInSubtotal: true, // model got it wrong the other way
    });
    // 20.50 + 1.64 + 4.10 = 26.24, the printed total → tax is additional.
    expect(toCents(us).taxIncluded).toBe(false);
  });

  it("falls back to the model's flag when there is no total to check against", () => {
    const noTotal = receiptExtractionSchema.parse({
      ...valid,
      total: null,
      taxIncludedInSubtotal: true,
    });
    const c = toCents(noTotal);
    expect(c.taxIncluded).toBe(true);
    // ...and the computed total then excludes the tax.
    expect(c.totalCents).toBe(2050 + 410);
  });

  it("tolerates a one-cent rounding difference", () => {
    const rounded = receiptExtractionSchema.parse({
      ...valid,
      items: [{ label: "X", quantity: 1, unitPrice: null, total: "100.00" }],
      subtotal: "100.00",
      tax: "9.00",
      tip: "10.00",
      total: "110.01", // 1 cent off subtotal+tip
      taxIncludedInSubtotal: false,
    });
    expect(toCents(rounded).taxIncluded).toBe(true);
  });

  it("does not introduce float error on awkward amounts", () => {
    const c = toCents(
      receiptExtractionSchema.parse({
        ...valid,
        items: [{ label: "Thing", quantity: 1, unitPrice: null, total: "1.15" }],
        subtotal: "1.15",
        total: "1.15",
      })
    );
    expect(c.items[0]?.totalCents).toBe(115);
    expect(c.totalCents).toBe(115);
  });
});
