import { describe, expect, it } from "vitest";
import { deletePhotoInput, uploadPhotoFormSchema } from "./photos";

describe("uploadPhotoFormSchema", () => {
  it("accepts a valid UUID restaurantId", () => {
    const result = uploadPhotoFormSchema.safeParse({
      restaurantId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID restaurantId", () => {
    const result = uploadPhotoFormSchema.safeParse({ restaurantId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("deletePhotoInput", () => {
  it("accepts a valid UUID id", () => {
    const result = deletePhotoInput.safeParse({ id: "00000000-0000-0000-0000-000000000002" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID id", () => {
    const result = deletePhotoInput.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
