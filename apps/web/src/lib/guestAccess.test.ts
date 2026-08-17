import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstParticipant = vi.fn();
const findFirstSplit = vi.fn();
const guestLinksEnabledMock = vi.fn();

vi.mock("@forkd/db", () => ({
  db: {
    query: {
      billSplitParticipants: { findFirst: (...a: unknown[]) => findFirstParticipant(...a) },
      billSplits: { findFirst: (...a: unknown[]) => findFirstSplit(...a) },
    },
  },
  billSplits: { id: "id", shareToken: "share_token", deletedAt: "deleted_at" },
  billSplitParticipants: { guestToken: "guest_token" },
}));

vi.mock("@forkd/api/splits", () => ({
  guestLinksEnabled: () => guestLinksEnabledMock(),
}));

const {
  _resetGuestRateLimits,
  clientIp,
  guestFailureBudgetOk,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
} = await import("./guestAccess");

const TOKEN = "a".repeat(40);

const participant = {
  id: "participant-1",
  splitId: "split-1",
  displayName: "Kim",
  guestToken: TOKEN,
  guestTokenExpiresAt: new Date(Date.now() + 86_400_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  guestLinksEnabledMock.mockResolvedValue(true);
  findFirstParticipant.mockResolvedValue(participant);
  findFirstSplit.mockResolvedValue({ id: "split-1", shareEnabled: true });
});

describe("resolveGuestToken", () => {
  it("resolves a valid token to exactly one participant on one bill", async () => {
    const res = await resolveGuestToken(TOKEN);
    expect(res).toEqual({
      ok: true,
      ctx: { participantId: "participant-1", splitId: "split-1", displayName: "Kim" },
    });
  });

  it("refuses everything while guest links are switched off", async () => {
    guestLinksEnabledMock.mockResolvedValue(false);
    const res = await resolveGuestToken(TOKEN);
    expect(res).toEqual({ ok: false, reason: "disabled" });
    // The flag is checked before any lookup — a disabled deployment does no work.
    expect(findFirstParticipant).not.toHaveBeenCalled();
  });

  it("refuses an unknown token", async () => {
    findFirstParticipant.mockResolvedValue(undefined);
    expect(await resolveGuestToken(TOKEN)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses an expired token", async () => {
    findFirstParticipant.mockResolvedValue({
      ...participant,
      guestTokenExpiresAt: new Date(Date.now() - 1000),
    });
    expect(await resolveGuestToken(TOKEN)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses when the bill was deleted", async () => {
    findFirstSplit.mockResolvedValue(undefined);
    expect(await resolveGuestToken(TOKEN)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses when sharing was turned off on the bill", async () => {
    findFirstSplit.mockResolvedValue({ id: "split-1", shareEnabled: false });
    expect(await resolveGuestToken(TOKEN)).toEqual({ ok: false, reason: "unshared" });
  });

  it("rejects absent or implausibly short tokens without touching the database", async () => {
    for (const bad of [null, "", "short", "x".repeat(19)]) {
      expect(await resolveGuestToken(bad), String(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(guestLinksEnabledMock).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long token", async () => {
    expect(await resolveGuestToken("x".repeat(201))).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts a token with no expiry set", async () => {
    findFirstParticipant.mockResolvedValue({ ...participant, guestTokenExpiresAt: null });
    const res = await resolveGuestToken(TOKEN);
    expect(res.ok).toBe(true);
  });
});

describe("rate limiting", () => {
  beforeEach(() => _resetGuestRateLimits());

  it("allows a normal burst from one IP, then throttles", () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 120; i++) expect(guestRateLimit(ip)).toBe(true);
    expect(guestRateLimit(ip)).toBe(false);
  });

  it("tracks IPs independently, so one scanner can't throttle everyone", () => {
    for (let i = 0; i < 121; i++) guestRateLimit("203.0.113.2");
    expect(guestRateLimit("203.0.113.2")).toBe(false);
    expect(guestRateLimit("203.0.113.3")).toBe(true);
  });

  it("throttles token guessing — the budget must not depend on the token", () => {
    // This is the regression the original implementation had: it keyed the
    // bucket on ip + token prefix, so rotating tokens reset the budget every
    // request and enumeration was completely unthrottled.
    const ip = "203.0.113.4";
    // Each call stands for a *different* guessed token in the real handler.
    for (let i = 0; i < 20; i++) expect(noteGuestFailure(ip)).toBe(true);
    expect(noteGuestFailure(ip)).toBe(false); // 21st guess is refused with 429
  });

  it("never penalises a valid token — failures are only counted after a miss", () => {
    // A household behind one NAT: a neighbour burns the failure budget, but the
    // real guest's working link must still open. The handler only calls
    // noteGuestFailure() when a token fails to resolve, so a good token never
    // consults this budget at all.
    const ip = "203.0.113.8";
    for (let i = 0; i < 50; i++) noteGuestFailure(ip);
    expect(guestFailureBudgetOk(ip)).toBe(false); // budget is spent...
    expect(guestRateLimit(ip)).toBe(true); //        ...but requests still flow
  });

  it("does not spend the failure budget on successful lookups", () => {
    const ip = "203.0.113.5";
    for (let i = 0; i < 100; i++) guestRateLimit(ip);
    expect(guestFailureBudgetOk(ip)).toBe(true);
  });

  it("keeps failure budgets per-IP so a NAT neighbour can't lock a guest out", () => {
    for (let i = 0; i < 25; i++) noteGuestFailure("203.0.113.6");
    expect(guestFailureBudgetOk("203.0.113.6")).toBe(false);
    expect(guestFailureBudgetOk("203.0.113.7")).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the Cloudflare client IP", () => {
    const req = new Request("https://example.com/", {
      headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    const req = new Request("https://example.com/", {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("198.51.100.7");
  });

  it("degrades to a shared bucket when neither header is present", () => {
    expect(clientIp(new Request("https://example.com/"))).toBe("unknown");
  });
});
