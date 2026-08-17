import { db } from "@forkd/db";
import { buildSplitView } from "@forkd/api/splits";
import {
  clientIp,
  guestJson,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

/** The whole bill, as a guest is allowed to see it. */
export async function GET(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const resolved = await resolveGuestToken(token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  // `redact` drops the creator's identity and the family share token; the view
  // builder never returns email addresses on any path.
  const view = await buildSplitView(db, resolved.ctx.splitId, { redact: true });
  if (!view) return guestNotFound();

  return guestJson({
    ...view,
    myParticipantId: resolved.ctx.participantId,
    myDisplayName: resolved.ctx.displayName,
  });
}
