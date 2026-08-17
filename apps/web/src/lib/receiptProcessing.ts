import sharp from "sharp";
import {
  RECEIPT_FULL_MAX,
  RECEIPT_FULL_QUALITY,
  RECEIPT_THUMB_QUALITY,
  RECEIPT_THUMB_SIZE,
} from "@forkd/shared";

/**
 * Process a receipt photo for storage and for Claude.
 *
 * Same shape as processUploadedImage (restaurant photos) but with its own size
 * profile: receipts are tall and text-dense, so the thumbnail crops from the
 * top rather than the centre — the merchant name and date live up there, which
 * is what makes one receipt distinguishable from another in a list.
 *
 * EXIF is stripped implicitly: Sharp drops all metadata on re-encode unless
 * .withMetadata() is called, and it never is. .rotate() bakes the orientation
 * in first so a phone photo isn't stored sideways.
 */
export async function processReceiptImage(
  buf: Buffer
): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number; byteSize: number }> {
  const base = sharp(buf).rotate();

  const [fullRes, thumbBuf] = await Promise.all([
    base
      .clone()
      .resize(RECEIPT_FULL_MAX, RECEIPT_FULL_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: RECEIPT_FULL_QUALITY })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize(RECEIPT_THUMB_SIZE, RECEIPT_THUMB_SIZE, { fit: "cover", position: "top" })
      .webp({ quality: RECEIPT_THUMB_QUALITY })
      .toBuffer(),
  ]);

  return {
    full: fullRes.data,
    thumb: thumbBuf,
    width: fullRes.info.width,
    height: fullRes.info.height,
    byteSize: fullRes.data.length,
  };
}
