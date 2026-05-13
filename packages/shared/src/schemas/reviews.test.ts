import { describe, expect, it } from "vitest";
import { reviewFormSchema, upsertReviewInput } from "./reviews";

describe("reviewStarsSchema (via upsertReviewInput)", () => {
  it("rejects stars = 0", () => {
    const result = upsertReviewInput.safeParse({
      restaurantId: "00000000-0000-0000-0000-000000000001",
      stars: 0,
      text: "fine",
    });
    expect(result.success).toBe(false);
  });

  it("rejects stars = 6", () => {
    const result = upsertReviewInput.safeParse({
      restaurantId: "00000000-0000-0000-0000-000000000001",
      stars: 6,
      text: "fine",
    });
    expect(result.success).toBe(false);
  });

  it("rejects text longer than 5000 characters", () => {
    const result = upsertReviewInput.safeParse({
      restaurantId: "00000000-0000-0000-0000-000000000001",
      text: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects when both stars and text are null/absent", () => {
    const result = reviewFormSchema.safeParse({ stars: null, text: null });
    expect(result.success).toBe(false);
  });

  it("accepts stars-only (no text)", () => {
    const result = reviewFormSchema.safeParse({ stars: 4 });
    expect(result.success).toBe(true);
  });

  it("accepts text-only (no stars)", () => {
    const result = reviewFormSchema.safeParse({ text: "Great place!" });
    expect(result.success).toBe(true);
  });
});
