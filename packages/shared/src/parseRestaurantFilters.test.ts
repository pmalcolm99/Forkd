import { describe, it, expect } from "vitest";
import { parseRestaurantFilters } from "./parseRestaurantFilters";

describe("parseRestaurantFilters", () => {
  it("returns defaults for empty params", () => {
    const result = parseRestaurantFilters(new URLSearchParams());
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.sort).toBe("recent");
    expect(result.status).toBeUndefined();
    expect(result.state).toBeUndefined();
    expect(result.search).toBeUndefined();
  });

  it("parses multiple status values", () => {
    const params = new URLSearchParams("status=been_loved&status=been_okay");
    const result = parseRestaurantFilters(params);
    expect(result.status).toEqual(["been_loved", "been_okay"]);
  });

  it("falls back to defaults on invalid status value", () => {
    const params = new URLSearchParams("status=not_a_status");
    const result = parseRestaurantFilters(params);
    expect(result.page).toBe(1);
    expect(result.status).toBeUndefined();
  });

  it("parses page and state", () => {
    const params = new URLSearchParams("page=3&state=TX");
    const result = parseRestaurantFilters(params);
    expect(result.page).toBe(3);
    expect(result.state).toBe("TX");
  });

  it("parses search and cuisineTypeId", () => {
    const params = new URLSearchParams(
      "search=tacos&cuisineTypeId=00000000-0000-0000-0000-000000000001"
    );
    const result = parseRestaurantFilters(params);
    expect(result.search).toBe("tacos");
    expect(result.cuisineTypeId).toBe("00000000-0000-0000-0000-000000000001");
  });
});
