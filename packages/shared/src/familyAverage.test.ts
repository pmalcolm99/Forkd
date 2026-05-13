import { describe, expect, it } from "vitest";
import { formatFamilyAverage } from "./familyAverage";

describe("formatFamilyAverage", () => {
  it("returns 'No ratings yet' when count is zero", () => {
    const result = formatFamilyAverage(null, 0);
    expect(result.display).toBe("No ratings yet");
    expect(result.ariaLabel).toBe("No ratings yet");
  });

  it("returns 'No ratings yet' when avg is null but count is nonzero", () => {
    const result = formatFamilyAverage(null, 2);
    expect(result.display).toBe("No ratings yet");
  });

  it("formats a normal average correctly", () => {
    const result = formatFamilyAverage(3.5, 2);
    expect(result.display).toBe("★ 3.5 (2)");
    expect(result.ariaLabel).toBe("Average rating 3.5 stars from 2 family members");
  });

  it("uses singular 'member' when count is 1", () => {
    const result = formatFamilyAverage(5.0, 1);
    expect(result.ariaLabel).toBe("Average rating 5.0 stars from 1 family member");
  });
});
