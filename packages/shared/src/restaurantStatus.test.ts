import { describe, it, expect } from "vitest";
import {
  RESTAURANT_STATUS_LABELS,
  RESTAURANT_STATUS_PIN_COLORS,
  restaurantStatusEnum,
} from "./index";

const ALL_STATUSES = restaurantStatusEnum.options;

describe("RESTAURANT_STATUS_LABELS", () => {
  it("has an entry for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(RESTAURANT_STATUS_LABELS[status]).toBeDefined();
    }
  });

  it("has no extra keys", () => {
    expect(Object.keys(RESTAURANT_STATUS_LABELS)).toHaveLength(ALL_STATUSES.length);
  });
});

describe("RESTAURANT_STATUS_PIN_COLORS", () => {
  it("has an entry for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(RESTAURANT_STATUS_PIN_COLORS[status]).toBeDefined();
    }
  });

  it("has no extra keys", () => {
    expect(Object.keys(RESTAURANT_STATUS_PIN_COLORS)).toHaveLength(ALL_STATUSES.length);
  });

  it("each value is a non-empty hex color string", () => {
    for (const status of ALL_STATUSES) {
      const color = RESTAURANT_STATUS_PIN_COLORS[status];
      expect(color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });
});
