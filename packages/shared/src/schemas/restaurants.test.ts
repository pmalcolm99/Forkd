import { describe, expect, it } from "vitest";
import { createRestaurantInput } from "./restaurants";

describe("createRestaurantInput", () => {
  it("rejects an invalid status value", () => {
    const result = createRestaurantInput.safeParse({
      name: "Test",
      address: "123 Main St",
      state: "CO",
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name exceeding 200 characters", () => {
    const result = createRestaurantInput.safeParse({
      name: "x".repeat(201),
      address: "123 Main St",
      state: "CO",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid website URL", () => {
    const result = createRestaurantInput.safeParse({
      name: "Test",
      address: "123 Main St",
      state: "CO",
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid minimal input", () => {
    const result = createRestaurantInput.safeParse({
      name: "Test Restaurant",
      address: "123 Main St",
      state: "CO",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("want_to_try");
    }
  });
});
