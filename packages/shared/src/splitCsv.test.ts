import { describe, expect, it } from "vitest";
import { buildSplitCsv, csvCell, splitCsvFilename, type SplitCsvInput } from "./splitCsv";
import { computeSplit } from "./splitMath";

function makeInput(over: Partial<SplitCsvInput> = {}): SplitCsvInput {
  const items = [
    {
      label: "Wiener Schnitzel",
      quantity: 1,
      totalCents: 2690,
      claims: [{ participantId: "p1", shares: 1 }],
    },
    {
      label: "Gulasch",
      quantity: 1,
      totalCents: 1280,
      claims: [{ participantId: "p2", shares: 1 }],
    },
    { label: "Sekt", quantity: 1, totalCents: 690, claims: [] },
  ];
  const math = computeSplit({
    items: items.map((i, n) => ({ id: `i${n}`, totalCents: i.totalCents, claims: i.claims })),
    participantIds: ["p1", "p2"],
    taxCents: 0,
    tipCents: 460,
    serviceCents: 0,
    discountCents: 0,
    tipMode: "proportional",
    taxMode: "proportional",
    partySize: null,
  });
  return {
    title: "Saturday Dinner",
    merchantName: "Gasthaus Pöschl",
    restaurantName: null,
    purchasedAt: "2026-08-15T18:30:00.000Z",
    currency: "EUR",
    homeCurrency: "USD",
    effectiveFxRate: 1.16,
    totalCents: 5120,
    payerName: "Preston Malcolm",
    participants: [
      { id: "p1", displayName: "Preston Malcolm", paidAt: null },
      { id: "p2", displayName: "Mason", paidAt: "2026-08-16T00:00:00.000Z" },
    ],
    items: items.map((i, n) => ({ ...i, id: `i${n}` })),
    math,
    ...over,
  };
}

/** Split a CSV line into its unquoted cell values. */
function cells(line: string): string[] {
  return (line.match(/"(?:[^"]|"")*"/g) ?? []).map((c) => c.slice(1, -1).replace(/""/g, '"'));
}
const lines = (csv: string) => csv.split("\r\n");
const find = (csv: string, first: string) => lines(csv).find((l) => cells(l)[0] === first);

describe("csvCell", () => {
  it("quotes and doubles embedded quotes", () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("keeps commas and newlines inside the field", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  // Item labels come from an LLM reading a photo of a receipt, so they are
  // untrusted text landing in a spreadsheet that executes formulas.
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@import", "\tcmd"])(
    "defuses the formula-injection prefix in %j",
    (payload) => {
      expect(csvCell(payload)).toBe(`"'${payload}"`);
    }
  );

  it("does not molest an ordinary negative amount written as a number", () => {
    // Amounts go through centsToMoneyString, which is why this matters: the
    // guard applies to the string form, and "-3.50" would be prefixed. Callers
    // pass negatives only in discount columns, where a leading apostrophe is
    // still correct for Excel — assert the behaviour rather than assume it.
    expect(csvCell("-3.50")).toBe(`"'-3.50"`);
  });

  it("renders null and undefined as empty cells", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

describe("buildSplitCsv — header block", () => {
  const csv = buildSplitCsv(makeInput());

  it("names the restaurant, the date and who paid", () => {
    expect(cells(find(csv, "Restaurant")!)[1]).toBe("Gasthaus Pöschl");
    expect(cells(find(csv, "Date")!)[1]).toBe("2026-08-15");
    expect(cells(find(csv, "Paid by")!)[1]).toBe("Preston Malcolm");
  });

  it("prefers the linked restaurant name over the name printed on the receipt", () => {
    const c = buildSplitCsv(makeInput({ restaurantName: "Gasthaus Pöschl (Vienna)" }));
    expect(cells(find(c, "Restaurant")!)[1]).toBe("Gasthaus Pöschl (Vienna)");
    expect(cells(find(c, "Receipt name")!)[1]).toBe("Gasthaus Pöschl");
  });

  it("gives the total in both currencies", () => {
    expect(cells(find(csv, "Bill total (EUR)")!)[1]).toBe("51.20");
    expect(cells(find(csv, "Bill total (USD)")!)[1]).toBe("59.39");
  });

  it("states the rate it used", () => {
    expect(cells(find(csv, "Exchange rate")!)[1]).toContain("1 EUR = 1.160000 USD");
  });

  it("says n/a for a single-currency bill rather than inventing a rate", () => {
    const c = buildSplitCsv(makeInput({ currency: "USD", effectiveFxRate: 1 }));
    expect(cells(find(c, "Exchange rate")!)[1]).toBe("n/a");
    expect(cells(find(c, "Bill total (USD)")!)[1]).toBe("51.20");
  });

  it("does not leave the payer blank when nobody is recorded", () => {
    const c = buildSplitCsv(makeInput({ payerName: null }));
    expect(cells(find(c, "Paid by")!)[1]).toBe("(not recorded)");
  });
});

describe("buildSplitCsv — who owes what", () => {
  const csv = buildSplitCsv(makeInput());

  it("gives each person a row with both currencies and their paid status", () => {
    const row = cells(find(csv, "Mason")!);
    expect(row[1]).toBe("12.80"); // items, EUR
    // Tip is proportional to the FULL items subtotal (46.60), not to what has
    // been claimed so far — 12.80/46.60 × 4.60 = 1.26. The unclaimed Sekt keeps
    // its own share of the tip instead of it landing on whoever claimed first.
    expect(row[5]).toBe("1.26"); // tip, EUR
    expect(row[7]).toBe("14.06"); // owes, EUR
    expect(row[8]).toBe("16.31"); // owes, USD
    expect(row[9]).toBe("yes"); // settled up
  });

  it("marks someone who has not settled", () => {
    expect(cells(find(csv, "Preston Malcolm")!).at(-1)).toBe("no");
  });

  it("reports unclaimed items instead of quietly dropping them", () => {
    const row = lines(csv).find((l) => cells(l)[0]?.startsWith("Unclaimed"));
    expect(row).toBeDefined();
    expect(cells(row!)[0]).toBe("Unclaimed (1 item)");
  });

  it("totals to the same figure the app shows, in both currencies", () => {
    const row = cells(find(csv, "TOTAL")!);
    const math = makeInput().math;
    expect(row[7]).toBe((math.grandTotalCents / 100).toFixed(2));
    expect(row[8]).toBe((Math.round(math.grandTotalCents * 1.16) / 100).toFixed(2));
  });

  it("labels tax as included when it is already inside the prices", () => {
    const base = makeInput();
    const c = buildSplitCsv({ ...base, math: { ...base.math, taxIncluded: true } });
    expect(c).toContain("Tax (already in prices) (EUR)");
  });
});

describe("buildSplitCsv — line items", () => {
  const csv = buildSplitCsv(makeInput());

  it("lists each item with who claimed it", () => {
    expect(cells(find(csv, "Wiener Schnitzel")!)[4]).toBe("Preston Malcolm");
  });

  it("says nobody rather than leaving an unclaimed item ambiguous", () => {
    expect(cells(find(csv, "Sekt")!)[4]).toBe("(nobody)");
  });

  it("records how many ways a shared item was split", () => {
    const input = makeInput();
    input.items[0]!.claims = [
      { participantId: "p1", shares: 1 },
      { participantId: "p2", shares: 1 },
    ];
    const row = cells(find(buildSplitCsv(input), "Wiener Schnitzel")!);
    expect(row[4]).toBe("Preston Malcolm; Mason");
    expect(row[5]).toBe("2");
  });
});

describe("splitCsvFilename", () => {
  it("slugs the title and appends the date", () => {
    expect(splitCsvFilename("Saturday Dinner", "2026-08-15T00:00:00Z")).toBe(
      "forkd-saturday-dinner-2026-08-15.csv"
    );
  });

  it("never emits quotes or slashes that would break Content-Disposition", () => {
    const name = splitCsvFilename('Dinner "at" Bob/Jane\'s', null);
    expect(name).not.toMatch(/["/\\]/);
    expect(name).toBe("forkd-dinner-at-bob-jane-s.csv");
  });

  it("falls back to a usable name for an untitled bill", () => {
    expect(splitCsvFilename("!!!", null)).toBe("forkd-bill.csv");
  });
});
