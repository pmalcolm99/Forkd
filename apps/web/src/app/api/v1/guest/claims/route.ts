import { eq } from "drizzle-orm";
import { db, billSplitClaims, billSplitItems } from "@forkd/db";
import { guestClaimsBody } from "@forkd/shared";
import {
  clientIp,
  guestJson,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

/** A guest picking the items they ordered. Writes only their own claims. */
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const parsed = guestClaimsBody.safeParse(body);
  if (!parsed.success) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const resolved = await resolveGuestToken(parsed.data.token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }
  const { participantId, splitId } = resolved.ctx;

  // Only item ids that belong to this bill are accepted — a token for one bill
  // can never be used to write a claim against another.
  const validItems = await db
    .select({ id: billSplitItems.id })
    .from(billSplitItems)
    .where(eq(billSplitItems.splitId, splitId));
  const validIds = new Set(validItems.map((i) => i.id));
  const claims = parsed.data.claims.filter((c) => validIds.has(c.itemId));

  await db.transaction(async (tx) => {
    await tx.delete(billSplitClaims).where(eq(billSplitClaims.participantId, participantId));
    if (claims.length > 0) {
      await tx.insert(billSplitClaims).values(
        claims.map((c) => ({
          splitId,
          itemId: c.itemId,
          participantId,
          shares: c.shares,
        }))
      );
    }
  });

  return guestJson({ success: true, claimed: claims.length });
}
