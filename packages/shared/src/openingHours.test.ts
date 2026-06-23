import { describe, expect, it } from "vitest";
import { computeOpenNow, getTodayHours, type OpeningHours } from "./openingHours";

const WEEKDAYS = [
  "Monday: 9:00 AM – 5:00 PM",
  "Tuesday: 9:00 AM – 5:00 PM",
  "Wednesday: 9:00 AM – 5:00 PM",
  "Thursday: 9:00 AM – 5:00 PM",
  "Friday: 9:00 AM – 5:00 PM",
  "Saturday: Closed",
  "Sunday: Closed",
];

describe("getTodayHours — today's label", () => {
  it("picks the local weekday and strips the day prefix", () => {
    const hours: OpeningHours = { weekdayDescriptions: WEEKDAYS, utcOffsetMinutes: 0 };
    // 2024-01-01T12:00Z is a Monday.
    const res = getTodayHours(hours, new Date("2024-01-01T12:00:00Z"));
    expect(res.todayLabel).toBe("9:00 AM – 5:00 PM");
  });

  it("uses utcOffsetMinutes to roll over the local day", () => {
    const hours: OpeningHours = { weekdayDescriptions: WEEKDAYS, utcOffsetMinutes: 120 };
    // Mon 23:00Z + 2h = Tue 01:00 local.
    const res = getTodayHours(hours, new Date("2024-01-01T23:00:00Z"));
    expect(res.todayLabel).toBe("9:00 AM – 5:00 PM"); // Tuesday's line
  });

  it("returns nulls when there are no hours", () => {
    expect(getTodayHours(null)).toEqual({ todayLabel: null, openNow: null });
  });
});

describe("computeOpenNow", () => {
  const weekdayHours: OpeningHours = {
    utcOffsetMinutes: 0,
    periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  };

  it("is open inside the period", () => {
    expect(computeOpenNow(weekdayHours, new Date("2024-01-01T12:00:00Z"))).toBe(true);
  });

  it("is closed outside the period", () => {
    expect(computeOpenNow(weekdayHours, new Date("2024-01-01T18:00:00Z"))).toBe(false);
  });

  it("handles overnight periods that wrap past Saturday→Sunday", () => {
    const overnight: OpeningHours = {
      utcOffsetMinutes: 0,
      periods: [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }],
    };
    // 2024-01-07T01:00Z is a Sunday 01:00 — inside the Sat 22:00 → Sun 02:00 window.
    expect(computeOpenNow(overnight, new Date("2024-01-07T01:00:00Z"))).toBe(true);
  });

  it("treats a single open period at Sunday 00:00 with no close as 24/7", () => {
    const always: OpeningHours = { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
    expect(computeOpenNow(always, new Date("2024-01-03T03:00:00Z"))).toBe(true);
  });

  it("returns null when periods are unknown", () => {
    expect(computeOpenNow({ weekdayDescriptions: WEEKDAYS }, new Date())).toBeNull();
  });
});
