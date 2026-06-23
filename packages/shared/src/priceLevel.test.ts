import { describe, expect, it } from "vitest";
import { formatPriceLevel, parseGooglePriceLevel } from "./priceLevel";

describe("formatPriceLevel", () => {
  it("renders 1–4 as repeated dollar signs", () => {
    expect(formatPriceLevel(1)).toBe("$");
    expect(formatPriceLevel(3)).toBe("$$$");
    expect(formatPriceLevel(4)).toBe("$$$$");
  });

  it("returns null for unknown/out-of-range", () => {
    expect(formatPriceLevel(null)).toBeNull();
    expect(formatPriceLevel(undefined)).toBeNull();
    expect(formatPriceLevel(0)).toBeNull();
    expect(formatPriceLevel(5)).toBeNull();
  });
});

describe("parseGooglePriceLevel", () => {
  it("maps the Google enum to 1–4", () => {
    expect(parseGooglePriceLevel("PRICE_LEVEL_INEXPENSIVE")).toBe(1);
    expect(parseGooglePriceLevel("PRICE_LEVEL_MODERATE")).toBe(2);
    expect(parseGooglePriceLevel("PRICE_LEVEL_EXPENSIVE")).toBe(3);
    expect(parseGooglePriceLevel("PRICE_LEVEL_VERY_EXPENSIVE")).toBe(4);
  });

  it("returns null for FREE / unspecified / nullish", () => {
    expect(parseGooglePriceLevel("PRICE_LEVEL_FREE")).toBeNull();
    expect(parseGooglePriceLevel("PRICE_LEVEL_UNSPECIFIED")).toBeNull();
    expect(parseGooglePriceLevel(null)).toBeNull();
    expect(parseGooglePriceLevel(undefined)).toBeNull();
  });
});
