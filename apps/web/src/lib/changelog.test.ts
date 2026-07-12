import { describe, expect, it } from "vitest";
import { isNewer, unseenChangelog, CHANGELOG } from "./changelog";

describe("isNewer", () => {
  it("compares dotted numeric versions", () => {
    expect(isNewer("1.1.0", "1.0.4")).toBe(true);
    expect(isNewer("1.0.4", "1.1.0")).toBe(false);
    expect(isNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isNewer("2.0.0", "1.9.9")).toBe(true);
    expect(isNewer("1.10.0", "1.9.0")).toBe(true); // numeric, not lexical
  });

  it("handles differing segment counts", () => {
    expect(isNewer("1.1", "1.1.0")).toBe(false);
    expect(isNewer("1.1.1", "1.1")).toBe(true);
  });
});

describe("unseenChangelog", () => {
  it("returns all entries when nothing seen", () => {
    expect(unseenChangelog(null).length).toBe(CHANGELOG.length);
  });

  it("returns nothing when caught up to the newest entry", () => {
    const newest = CHANGELOG[0]!.version;
    expect(unseenChangelog(newest)).toHaveLength(0);
  });
});
