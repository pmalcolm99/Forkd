import { and, eq, isNull } from "drizzle-orm";
import { db, billSplits, billSplitParticipants } from "@forkd/db";
import { guestLinksEnabled } from "@forkd/api/splits";

/**
 * Guest-link authorisation.
 *
 * These endpoints are the only part of Forkd reachable without Cloudflare
 * Access, so the rules are deliberately narrow:
 *
 *  - the whole surface is inert unless the operator has switched
 *    `receipts.guest_links_enabled` on (and added the CF Access bypass policy);
 *  - a token is 32 random bytes and maps to exactly ONE participant on ONE
 *    bill — it is a capability, not an identity;
 *  - it expires, and can be revoked individually;
 *  - every failure answers an identical 404, so a caller can't tell a bad token
 *    from an expired one from a deleted bill;
 *  - nothing that leaves here ever contains an email address.
 */

export interface GuestContext {
  participantId: string;
  splitId: string;
  displayName: string;
}

export type GuestResolution =
  | { ok: true; ctx: GuestContext }
  | { ok: false; reason: "disabled" | "invalid" | "expired" | "unshared" };

export async function resolveGuestToken(token: string | null): Promise<GuestResolution> {
  if (!token || token.length < 20 || token.length > 200) {
    return { ok: false, reason: "invalid" };
  }
  if (!(await guestLinksEnabled(db))) {
    return { ok: false, reason: "disabled" };
  }

  const participant = await db.query.billSplitParticipants.findFirst({
    where: eq(billSplitParticipants.guestToken, token),
  });
  if (!participant) return { ok: false, reason: "invalid" };

  if (participant.guestTokenExpiresAt && participant.guestTokenExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const split = await db.query.billSplits.findFirst({
    where: and(eq(billSplits.id, participant.splitId), isNull(billSplits.deletedAt)),
    columns: { id: true, shareEnabled: true },
  });
  if (!split) return { ok: false, reason: "invalid" };
  if (!split.shareEnabled) return { ok: false, reason: "unshared" };

  return {
    ok: true,
    ctx: {
      participantId: participant.id,
      splitId: participant.splitId,
      displayName: participant.displayName,
    },
  };
}

/** Every rejection looks identical from the outside. */
export function guestNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}

export function guestJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fixed-window limiters, in memory.
 *
 * Two separate budgets, both keyed on the CLIENT IP ALONE — never on the token.
 * An earlier version keyed on `ip:tokenPrefix`, which meant an attacker rotating
 * tokens got a fresh bucket on every request and was never throttled at all. The
 * budget has to be independent of the thing being guessed, or it isn't a budget.
 *
 *   - REQUEST budget: all guest traffic from one IP. Stops hammering.
 *   - FAILURE budget: requests from one IP that presented a token we rejected.
 *     Much tighter, because a legitimate guest fails ~never — they follow a link
 *     that works. Sustained failures mean scanning.
 *
 * Deliberately throttle-and-keep-serving (429) rather than blocking the IP: a
 * household behind one NAT must never be able to lock a real guest out.
 *
 * In-process Map rather than Redis: the BullMQ workers already run in this
 * process, so this matches how the app is deployed. It resets on restart, and
 * with multiple replicas each would hold its own counters — acceptable, because
 * Cloudflare rate-limits at the edge as well and this is defence in depth.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 120;
const MAX_FAILURES_PER_IP = 20;

type Bucket = { count: number; resetAt: number };
const requestBuckets = new Map<string, Bucket>();
const failureBuckets = new Map<string, Bucket>();

function sweep(map: Map<string, Bucket>, now: number): void {
  if (map.size <= 5000) return;
  for (const [k, v] of map) if (v.resetAt < now) map.delete(k);
}

/** Increment a window and report whether it is still within budget. */
function take(map: Map<string, Bucket>, key: string, max: number): boolean {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    sweep(map, now);
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/**
 * Read a window without incrementing it.
 *
 * Strictly less-than: this is checked *before* an attempt, so once `max`
 * failures are already recorded the allowance is spent and the next attempt is
 * refused rather than being the one that trips it.
 */
function peek(map: Map<string, Bucket>, key: string, max: number): boolean {
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt < Date.now()) return true;
  return bucket.count < max;
}

/** Overall request budget for this IP. Call once per guest request. */
export function guestRateLimit(ip: string): boolean {
  return take(requestBuckets, ip, MAX_REQUESTS_PER_IP);
}

/** Has this IP burned its budget for bad tokens? Exposed for tests. */
export function guestFailureBudgetOk(ip: string): boolean {
  return peek(failureBuckets, ip, MAX_FAILURES_PER_IP);
}

/**
 * Record a rejected token. Returns false once this IP has exceeded its failure
 * budget, meaning the caller should answer 429 rather than 404.
 *
 * Deliberately called only *after* a token fails to resolve, never as a
 * pre-check. A valid token is therefore never refused because of someone else's
 * guessing — which matters when a whole household shares one NAT address, and a
 * pre-check would let one bad actor lock a real guest out for the window.
 * Total work is still bounded by the separate per-IP request budget above.
 */
export function noteGuestFailure(ip: string): boolean {
  return take(failureBuckets, ip, MAX_FAILURES_PER_IP);
}

/**
 * The client IP, preferring Cloudflare's header.
 *
 * `cf-connecting-ip` is set by Cloudflare and, because every guest request
 * reaches us through the tunnel, cannot be spoofed by the client. The
 * `x-forwarded-for` fallback only matters for direct local access.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Test seam — clears both windows. */
export function _resetGuestRateLimits(): void {
  requestBuckets.clear();
  failureBuckets.clear();
}

export function tooManyRequests(): Response {
  return new Response("Too Many Requests", {
    status: 429,
    headers: { "Retry-After": "60", "X-Robots-Tag": "noindex, nofollow" },
  });
}
