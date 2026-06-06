import { describe, expect, it } from "vitest";
import { extractionSchema } from "./pipeline/extractorAi";

// ── extractionSchema Zod validation ─────────────────────────────────────────
// These tests guard the AI safety layer: if Claude returns garbage, the worker
// must fail the job cleanly rather than inserting invalid data into the DB.

describe("extractionSchema", () => {
  const valid = {
    name: "Joe's Pizza",
    address: "123 Main St",
    state: "NY",
    cuisine: "Italian",
    description: "Classic New York-style pizza since 1985.",
    confidence: "high",
  };

  it("accepts a fully valid extraction", () => {
    expect(extractionSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty strings for optional text fields", () => {
    const result = extractionSchema.safeParse({
      ...valid,
      address: "",
      cuisine: "",
      description: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all 50 states plus DC", () => {
    const states = [
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "FL",
      "GA",
      "HI",
      "ID",
      "IL",
      "IN",
      "IA",
      "KS",
      "KY",
      "LA",
      "ME",
      "MD",
      "MA",
      "MI",
      "MN",
      "MS",
      "MO",
      "MT",
      "NE",
      "NV",
      "NH",
      "NJ",
      "NM",
      "NY",
      "NC",
      "ND",
      "OH",
      "OK",
      "OR",
      "PA",
      "RI",
      "SC",
      "SD",
      "TN",
      "TX",
      "UT",
      "VT",
      "VA",
      "WA",
      "WV",
      "WI",
      "WY",
      "DC",
    ];
    for (const state of states) {
      expect(extractionSchema.safeParse({ ...valid, state }).success).toBe(true);
    }
  });

  it("rejects when name is missing", () => {
    const noName = {
      address: valid.address,
      state: valid.state,
      cuisine: valid.cuisine,
      description: valid.description,
      confidence: valid.confidence,
    };
    expect(extractionSchema.safeParse(noName).success).toBe(false);
  });

  it("rejects when name is an empty string", () => {
    expect(extractionSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an invalid state code 'XX'", () => {
    expect(extractionSchema.safeParse({ ...valid, state: "XX" }).success).toBe(false);
  });

  it("rejects a full state name like 'Texas'", () => {
    expect(extractionSchema.safeParse({ ...valid, state: "Texas" }).success).toBe(false);
  });

  it("rejects an invalid confidence value", () => {
    expect(extractionSchema.safeParse({ ...valid, confidence: "very_high" }).success).toBe(false);
  });

  it("rejects null (malformed Claude output)", () => {
    expect(extractionSchema.safeParse(null).success).toBe(false);
  });

  it("rejects a plain string (Claude preamble instead of JSON)", () => {
    expect(extractionSchema.safeParse("Here is the restaurant info:").success).toBe(false);
  });

  it("rejects an empty object", () => {
    expect(extractionSchema.safeParse({}).success).toBe(false);
  });
});
