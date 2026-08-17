import { auth } from "@forkd/auth";
import { resolveReceiptImage, streamReceipt } from "@/lib/receiptServe";

/** Serve a receipt image to a signed-in Forkd user. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const sessionData = await auth.api.getSession({ headers: req.headers });
  if (!sessionData?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path: segments } = await params;
  const resolved = await resolveReceiptImage(segments);
  if (!resolved) return new Response("Not Found", { status: 404 });

  // When the creator has hidden the raw photos, only they can still see them —
  // everyone else keeps the itemized list without the card details on the paper.
  if (resolved.hideImagesFromOthers && resolved.createdByUserId !== sessionData.user.id) {
    return new Response("Not Found", { status: 404 });
  }

  return streamReceipt(resolved.storagePath);
}
