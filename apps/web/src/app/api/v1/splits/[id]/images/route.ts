import { and, count, eq, isNull } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, billSplits, billSplitImages } from "@forkd/db";
import {
  ACCEPTED_MIME_TYPES,
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_IMAGES,
  logger,
  receiptStoragePath,
  receiptThumbStoragePath,
} from "@forkd/shared";
import { detectImageFormat } from "@/lib/photoProcessing";
import { processReceiptImage } from "@/lib/receiptProcessing";
import { ensureSplitDir, writeReceiptFiles } from "@/lib/receiptStorage";

/**
 * Upload a receipt photo. REST rather than tRPC because this is multipart
 * binary; the validation ladder mirrors /api/v1/photos/upload step for step.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // 1. Session check
  const sessionData = await auth.api.getSession({ headers: req.headers });
  if (!sessionData?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }
  const user = sessionData.user;
  const { id: splitId } = await params;

  // 2. Split exists, isn't deleted, and belongs to this user (or they're staff)
  const split = await db.query.billSplits.findFirst({
    where: and(eq(billSplits.id, splitId), isNull(billSplits.deletedAt)),
  });
  if (!split) {
    return Response.json({ message: "Bill not found" }, { status: 404 });
  }
  const canEdit = split.createdByUserId === user.id || !!user.isAdmin || !!user.isOwner;
  if (!canEdit) {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  let fileBlob: Blob | null;
  try {
    // 3. Parse FormData
    const formData = await req.formData();
    fileBlob = formData.get("file") as Blob | null;
  } catch {
    return Response.json({ message: "Failed to parse form data" }, { status: 400 });
  }
  if (!fileBlob) {
    return Response.json({ message: "No file provided" }, { status: 400 });
  }

  // 4. Image count check
  const [countResult] = await db
    .select({ total: count() })
    .from(billSplitImages)
    .where(eq(billSplitImages.splitId, splitId));
  const existing = countResult?.total ?? 0;
  if (existing >= MAX_RECEIPT_IMAGES) {
    return Response.json(
      { message: `You can attach up to ${MAX_RECEIPT_IMAGES} receipt photos.` },
      { status: 409 }
    );
  }

  // 5. Size check, before reading into memory
  if (fileBlob.size > MAX_RECEIPT_BYTES) {
    return Response.json({ message: "File too large (max 10 MB)" }, { status: 400 });
  }

  // 6. MIME allowlist
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(fileBlob.type)) {
    return Response.json(
      { message: "Unsupported file type. Accepted: JPEG, PNG, WebP, HEIC." },
      { status: 400 }
    );
  }

  // 7. Read into a Buffer
  const buf = Buffer.from(await fileBlob.arrayBuffer());

  // 8. Magic-byte validation — the declared MIME type is not trusted
  if (!detectImageFormat(buf)) {
    return Response.json({ message: "File does not appear to be a valid image" }, { status: 400 });
  }

  // 9. Sharp: resize, re-encode to WebP, strip EXIF
  let full: Buffer, thumb: Buffer, width: number, height: number, byteSize: number;
  try {
    ({ full, thumb, width, height, byteSize } = await processReceiptImage(buf));
  } catch (err) {
    logger.warn({ splitId, userId: user.id, err }, "Receipt image processing failed");
    return Response.json(
      { message: "Could not process that photo. It may be corrupt or unsupported." },
      { status: 400 }
    );
  }

  // 10. Write to disk
  const imageId = crypto.randomUUID();
  try {
    await ensureSplitDir(splitId);
    await writeReceiptFiles(splitId, imageId, full, thumb);
  } catch (err) {
    logger.error({ splitId, imageId, userId: user.id, err }, "Failed to write receipt files");
    return Response.json({ message: "Failed to store photo" }, { status: 500 });
  }

  // 11. Insert the row
  const [row] = await db
    .insert(billSplitImages)
    .values({
      id: imageId,
      splitId,
      position: existing,
      filePath: receiptStoragePath(splitId, imageId),
      thumbPath: receiptThumbStoragePath(splitId, imageId),
      width,
      height,
      byteSize,
    })
    .returning();

  return Response.json({ id: row!.id, width, height });
}
