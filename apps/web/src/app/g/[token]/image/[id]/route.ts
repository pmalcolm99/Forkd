import { resolveReceiptImage, streamReceipt } from "@/lib/receiptServe";
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
 * Receipt photo for a guest. Lives under /g/ so the entire guest surface is one
 * path prefix — nothing else has to be opened up at the edge.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; id: string }> }
): Promise<Response> {
  const ip = clientIp(req);
  if (!guestRateLimit(ip)) return tooManyRequests();

  const { token, id } = await params;
  const resolved = await resolveGuestToken(token);
  if (!resolved.ok) {
    return noteGuestFailure(ip) ? guestNotFound() : tooManyRequests();
  }

  const image = await resolveReceiptImage(["splits", resolved.ctx.splitId, `${id}.webp`]);
  if (!image) return guestNotFound();
  // Guests are "other people" for the hide-images toggle, always.
  if (image.hideImagesFromOthers) return guestNotFound();

  return streamReceipt(image.storagePath);
}
