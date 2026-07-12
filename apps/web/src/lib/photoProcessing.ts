import sharp from "sharp";
import {
  PHOTO_FULL_MAX,
  PHOTO_FULL_QUALITY,
  PHOTO_THUMB_QUALITY,
  PHOTO_THUMB_SIZE,
  type AcceptedMimeType,
} from "@forkd/shared";

export function detectImageFormat(buf: Buffer): AcceptedMimeType | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";

  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";

  // WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";

  // HEIC/HEIF: "ftyp" at byte offset 4 (ISOBMFF container)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    // Brand at bytes 8-11: heic, heix, hevc, hevx, mif1, msf1, miaf, MiHB, etc.
    const brand = buf.slice(8, 12).toString("ascii");
    if (
      brand.startsWith("hei") ||
      brand.startsWith("hev") ||
      brand === "mif1" ||
      brand === "msf1" ||
      brand === "miaf"
    ) {
      return "image/heic";
    }
  }

  return null;
}

export async function processUploadedImage(
  buf: Buffer
): Promise<{ full: Buffer; thumb: Buffer; width: number; height: number; byteSize: number }> {
  // .rotate() honors EXIF orientation; Sharp strips EXIF on re-encode (no withMetadata)
  const base = sharp(buf).rotate();

  const [fullRes, thumbBuf] = await Promise.all([
    base
      .clone()
      .resize(PHOTO_FULL_MAX, PHOTO_FULL_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: PHOTO_FULL_QUALITY })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize(PHOTO_THUMB_SIZE, PHOTO_THUMB_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: PHOTO_THUMB_QUALITY })
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
