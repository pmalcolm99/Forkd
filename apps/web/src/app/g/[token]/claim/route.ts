import { eq } from "drizzle-orm";
import { db, billSplitClaims, billSplitItems } from "@forkd/db";
import {
  clientIp,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

export const dynamic = "force-dynamic";

/**
 * Save a guest's picks from the plain HTML form, then redirect back to the
 * page (POST-Redirect-Get) so a reload re-reads current state rather than
 * re-submitting.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  const { token } = await params;
  const resolved = await resolveGuestToken(token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }
  const { participantId, splitId } = resolved.ctx;

  // The real form is a few hundred bytes of uuids. Refuse anything wildly
  // larger before parsing it, so a token holder can't make us buffer a huge
  // body just because they hold a valid link.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 64 * 1024) return guestNotFound();

  let picked: string[];
  try {
    const form = await req.formData();
    picked = form.getAll("item").map(String);
  } catch {
    return guestNotFound();
  }

  // Only item ids belonging to THIS bill are accepted — a token for one bill
  // can never write a claim against another.
  const valid = await db
    .select({ id: billSplitItems.id })
    .from(billSplitItems)
    .where(eq(billSplitItems.splitId, splitId));
  const validIds = new Set(valid.map((v) => v.id));
  const claims = [...new Set(picked)].filter((id) => validIds.has(id));

  await db.transaction(async (tx) => {
    await tx.delete(billSplitClaims).where(eq(billSplitClaims.participantId, participantId));
    if (claims.length > 0) {
      await tx
        .insert(billSplitClaims)
        .values(claims.map((itemId) => ({ splitId, itemId, participantId, shares: 1 })));
    }
  });

  return new Response(null, {
    status: 303,
    headers: {
      Location: `/g/${encodeURIComponent(token)}?saved=1`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
