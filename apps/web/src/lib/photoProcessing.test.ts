import { describe, expect, it, test } from "vitest";
import { detectImageFormat, processUploadedImage } from "./photoProcessing";

// Minimal magic-byte buffers — no real image files in the repo
const JPEG_MAGIC = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const TEXT_BUF = Buffer.from("this is not an image at all!!!!");

describe("detectImageFormat", () => {
  it("identifies a JPEG buffer", () => {
    expect(detectImageFormat(JPEG_MAGIC)).toBe("image/jpeg");
  });

  it("identifies a PNG buffer", () => {
    expect(detectImageFormat(PNG_MAGIC)).toBe("image/png");
  });

  it("returns null for a non-image buffer", () => {
    expect(detectImageFormat(TEXT_BUF)).toBeNull();
  });
});

// Libheif smoke test — uses an AVIF fixture (AV1 compression, same libheif code path as HEIC).
// HEVC encoding is unavailable in this Alpine libheif build; AV1 is available and exercises the same decoder.
// Generated with: sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 128, b: 255 } } })
//   .heif({ compression: "av1" }).toBuffer()
const HEIC_FIXTURE: number[] = [
  0, 0, 0, 28, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0, 97, 118, 105, 102, 109, 105, 102,
  49, 109, 105, 97, 102, 0, 0, 0, 234, 109, 101, 116, 97, 0, 0, 0, 0, 0, 0, 0, 33, 104, 100, 108,
  114, 0, 0, 0, 0, 0, 0, 0, 0, 112, 105, 99, 116, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  14, 112, 105, 116, 109, 0, 0, 0, 0, 0, 1, 0, 0, 0, 34, 105, 108, 111, 99, 0, 0, 0, 0, 68, 64, 0,
  1, 0, 1, 0, 0, 0, 0, 1, 14, 0, 1, 0, 0, 0, 0, 0, 0, 0, 28, 0, 0, 0, 35, 105, 105, 110, 102, 0, 0,
  0, 0, 0, 1, 0, 0, 0, 21, 105, 110, 102, 101, 2, 0, 0, 0, 0, 1, 0, 0, 97, 118, 48, 49, 0, 0, 0, 0,
  106, 105, 112, 114, 112, 0, 0, 0, 75, 105, 112, 99, 111, 0, 0, 0, 19, 99, 111, 108, 114, 110, 99,
  108, 120, 0, 1, 0, 13, 0, 6, 128, 0, 0, 0, 12, 97, 118, 49, 67, 129, 32, 2, 0, 0, 0, 0, 20, 105,
  115, 112, 101, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 16, 112, 105, 120, 105, 0, 0, 0, 0, 3,
  8, 8, 8, 0, 0, 0, 23, 105, 112, 109, 97, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 4, 1, 130, 3, 4, 0, 0, 0,
  36, 109, 100, 97, 116, 18, 0, 10, 7, 56, 0, 6, 16, 16, 208, 105, 50, 15, 24, 0, 0, 0, 64, 0, 176,
  12, 102, 203, 56, 149, 233, 72, 56,
];

import sharp from "sharp";
const canProcessHeic =
  HEIC_FIXTURE.length > 0 && typeof (sharp.versions as Record<string, string>)["heif"] === "string";

test.skipIf(!canProcessHeic)(
  "processUploadedImage decodes a HEIF/AV1 buffer (libheif smoke test)",
  async () => {
    const heicBuf = Buffer.from(HEIC_FIXTURE);
    const result = await processUploadedImage(heicBuf);
    expect(result.full).toBeInstanceOf(Buffer);
    expect(result.thumb).toBeInstanceOf(Buffer);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  }
);
