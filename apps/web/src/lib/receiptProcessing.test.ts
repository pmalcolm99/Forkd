import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RECEIPT_FULL_MAX, RECEIPT_THUMB_SIZE } from "@forkd/shared";
import { processReceiptImage } from "./receiptProcessing";

/** A tall, narrow image — the shape of an actual receipt. */
async function makeReceipt(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .jpeg()
    .toBuffer();
}

describe("processReceiptImage", () => {
  it("caps the long edge at the receipt maximum", async () => {
    const input = await makeReceipt(1200, 4000);
    const out = await processReceiptImage(input);
    expect(out.height).toBe(RECEIPT_FULL_MAX);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(RECEIPT_FULL_MAX);
  }, 20000);

  it("does not upscale an already-small photo", async () => {
    const input = await makeReceipt(400, 900);
    const out = await processReceiptImage(input);
    expect(out.width).toBe(400);
    expect(out.height).toBe(900);
  }, 20000);

  it("emits WebP for both sizes", async () => {
    const input = await makeReceipt(600, 1400);
    const out = await processReceiptImage(input);
    expect((await sharp(out.full).metadata()).format).toBe("webp");
    expect((await sharp(out.thumb).metadata()).format).toBe("webp");
  }, 20000);

  it("produces a square thumbnail at the configured size", async () => {
    const input = await makeReceipt(600, 1400);
    const out = await processReceiptImage(input);
    const meta = await sharp(out.thumb).metadata();
    expect(meta.width).toBe(RECEIPT_THUMB_SIZE);
    expect(meta.height).toBe(RECEIPT_THUMB_SIZE);
  }, 20000);

  it("strips metadata — EXIF must never survive to disk", async () => {
    // withMetadata() bakes in an orientation tag; the pipeline must drop it.
    const input = await sharp({
      create: { width: 800, height: 1600, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    expect((await sharp(input).metadata()).orientation).toBe(6);

    const out = await processReceiptImage(input);
    const meta = await sharp(out.full).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  }, 20000);

  it("applies EXIF rotation before storing, so the receipt isn't sideways", async () => {
    // orientation 6 means "rotate 90° clockwise": a 1000x500 landscape source
    // should come out 500x1000 portrait.
    const input = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const out = await processReceiptImage(input);
    expect(out.width).toBe(500);
    expect(out.height).toBe(1000);
  }, 20000);

  it("reports a byte size matching the full-size buffer", async () => {
    const out = await processReceiptImage(await makeReceipt(900, 2000));
    expect(out.byteSize).toBe(out.full.length);
    expect(out.byteSize).toBeGreaterThan(0);
  }, 20000);
});
