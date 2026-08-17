import { eq } from "drizzle-orm";
import { db, billSplitParticipants } from "@forkd/db";
import { guestPaidBody } from "@forkd/shared";
import {
  clientIp,
  guestJson,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

/** A guest marking themselves paid (or un-paid). Touches only their own row. */
export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const parsed = guestPaidBody.safeParse(body);
  if (!parsed.success) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const resolved = await resolveGuestToken(parsed.data.token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  await db
    .update(billSplitParticipants)
    .set({ paidAt: parsed.data.paid ? new Date() : null })
    .where(eq(billSplitParticipants.id, resolved.ctx.participantId));

  return guestJson({ success: true });
}
