import { afterEach, describe, expect, it, vi } from "vitest";
import { downscaleImageFile, formatBytes } from "./clientImageResize";

/**
 * These run in the node environment (this workspace has no jsdom), so the
 * browser APIs are stubbed. That's enough to pin the decision logic — when we
 * resize, when we pass the original through, and that a decode failure can
 * never throw — which is the part with the bugs in it.
 */
// Cast through unknown: apps/web has the DOM lib loaded, so `document` and
// `createImageBitmap` are non-optional globals and can't be assigned or deleted
// without widening them first.
const g = globalThis as unknown as Record<string, unknown>;

function stubBrowser(opts: {
  bitmap?: { width: number; height: number } | "throw";
  blobSize?: number | null;
}) {
  const close = vi.fn();
  g.createImageBitmap = vi.fn(async () => {
    if (opts.bitmap === "throw") throw new Error("decode failed");
    return { width: opts.bitmap!.width, height: opts.bitmap!.height, close };
  });

  const ctx = {
    fillStyle: "",
    imageSmoothingQuality: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: (cb: (b: unknown) => void) =>
      cb(opts.blobSize == null ? null : { size: opts.blobSize, type: "image/jpeg" }),
  };
  g.document = { createElement: () => canvas };
  return { close, canvas, ctx };
}

function fakeFile(bytes: number, name = "IMG_4821.HEIC"): File {
  return { size: bytes, name, type: "image/jpeg" } as File;
}

afterEach(() => {
  delete g.createImageBitmap;
  delete g.document;
  vi.restoreAllMocks();
});

describe("downscaleImageFile", () => {
  it("resizes a big phone photo down to the target long edge", async () => {
    const { canvas } = stubBrowser({ bitmap: { width: 4032, height: 3024 }, blobSize: 180_000 });
    const res = await downscaleImageFile(fakeFile(14 * 1024 * 1024), 1568, 1.5 * 1024 * 1024);
    expect(res?.resized).toBe(true);
    expect(canvas.width).toBe(1568);
    expect(canvas.height).toBe(1176); // aspect ratio preserved
    expect(res?.originalBytes).toBe(14 * 1024 * 1024);
  });

  it("handles a portrait receipt (long edge is the height)", async () => {
    const { canvas } = stubBrowser({ bitmap: { width: 3024, height: 4032 }, blobSize: 150_000 });
    await downscaleImageFile(fakeFile(9 * 1024 * 1024), 1568, 1.5 * 1024 * 1024);
    expect(canvas.height).toBe(1568);
    expect(canvas.width).toBe(1176);
  });

  it("passes a small, already-correct photo through untouched", async () => {
    stubBrowser({ bitmap: { width: 900, height: 1200 }, blobSize: 100_000 });
    const res = await downscaleImageFile(fakeFile(300_000), 1568, 1.5 * 1024 * 1024);
    expect(res).toBeNull(); // caller uploads the original
  });

  it("still re-encodes a small-dimensioned but heavy file", async () => {
    stubBrowser({ bitmap: { width: 1000, height: 1000 }, blobSize: 120_000 });
    const res = await downscaleImageFile(fakeFile(6 * 1024 * 1024), 1568, 1.5 * 1024 * 1024);
    expect(res?.resized).toBe(true);
  });

  it("returns null instead of throwing when the browser can't decode (HEIC)", async () => {
    stubBrowser({ bitmap: "throw" });
    await expect(
      downscaleImageFile(fakeFile(18 * 1024 * 1024), 1568, 1.5 * 1024 * 1024)
    ).resolves.toBeNull();
  });

  it("returns null when the canvas refuses to produce a blob", async () => {
    stubBrowser({ bitmap: { width: 4032, height: 3024 }, blobSize: null });
    const res = await downscaleImageFile(fakeFile(14 * 1024 * 1024), 1568, 1.5 * 1024 * 1024);
    expect(res).toBeNull();
  });

  it("releases the decoded bitmap even when encoding fails", async () => {
    const { close } = stubBrowser({ bitmap: { width: 4032, height: 3024 }, blobSize: null });
    await downscaleImageFile(fakeFile(14 * 1024 * 1024), 1568, 1.5 * 1024 * 1024);
    expect(close).toHaveBeenCalled();
  });

  it("gives the output a .jpg name so the MIME allowlist accepts it", async () => {
    stubBrowser({ bitmap: { width: 4032, height: 3024 }, blobSize: 180_000 });
    const res = await downscaleImageFile(
      fakeFile(14 * 1024 * 1024, "IMG_4821.HEIC"),
      1568,
      1_500_000
    );
    expect(res?.file.name).toBe("IMG_4821.jpg");
    expect(res?.file.type).toBe("image/jpeg");
  });

  it("returns null outside a browser rather than exploding", async () => {
    const res = await downscaleImageFile(fakeFile(14 * 1024 * 1024), 1568, 1_500_000);
    expect(res).toBeNull();
  });
});

describe("formatBytes", () => {
  it("reads naturally in error copy", () => {
    expect(formatBytes(18 * 1024 * 1024)).toBe("18.0 MB");
    expect(formatBytes(180 * 1024)).toBe("180 KB");
    expect(formatBytes(10)).toBe("1 KB");
  });
});
