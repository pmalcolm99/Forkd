import { resolveReceiptImage, streamReceipt } from "@/lib/receiptServe";
import {
  clientIp,
  guestNotFound,
  guestRateLimit,
  noteGuestFailure,
  resolveGuestToken,
  tooManyRequests,
} from "@/lib/guestAccess";

/** Serve a receipt image to a guest, authorised by token alone. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
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

  const { path: segments } = await params;
  const image = await resolveReceiptImage(segments);
  if (!image) return guestNotFound();

  // The token is scoped to one bill; it cannot fetch another bill's photos.
  if (image.splitId !== resolved.ctx.splitId) return guestNotFound();
  // Guests are "other people" for the hide-images toggle, always.
  if (image.hideImagesFromOthers) return guestNotFound();

  return streamReceipt(image.storagePath);
}
