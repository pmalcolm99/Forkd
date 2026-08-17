import { eq } from "drizzle-orm";
import { db, billSplitParticipants } from "@forkd/db";
import {
  clientIp,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

export const dynamic = "force-dynamic";

/** Toggle this one guest's paid flag from the HTML form. */
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

  let paid = true;
  try {
    const form = await req.formData();
    paid = String(form.get("paid")) !== "false";
  } catch {
    return guestNotFound();
  }

  await db
    .update(billSplitParticipants)
    .set({ paidAt: paid ? new Date() : null })
    .where(eq(billSplitParticipants.id, resolved.ctx.participantId));

  return new Response(null, {
    status: 303,
    headers: {
      Location: `/g/${encodeURIComponent(token)}?saved=${paid ? "paid" : "unpaid"}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
