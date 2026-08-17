/**
 * Downscale an image in the browser before uploading it.
 *
 * Modern phones shoot 12–48MP photos that routinely land between 5 and 20 MB,
 * so rejecting anything over a fixed size means telling someone their receipt
 * photo is "too big" when the fix is entirely mechanical. We resize instead.
 *
 * Doing it client-side (rather than just raising the server limit) also means a
 * ~150 KB upload instead of a ~15 MB one, which matters a great deal when
 * you're on restaurant wifi or a phone connection.
 *
 * Returns null whenever the image can't be handled here — a HEIC file on a
 * browser that can't decode it, a corrupt file, a canvas that refuses to
 * allocate. The caller falls back to uploading the original, and Sharp does the
 * resize server-side. Never throws.
 */
export interface DownscaleResult {
  file: File;
  /** True when we actually re-encoded; false means the original is returned. */
  resized: boolean;
  originalBytes: number;
}

export async function downscaleImageFile(
  file: File,
  maxEdge: number,
  reencodeAboveBytes: number,
  quality = 0.85
): Promise<DownscaleResult | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return null;
  }

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation during decode, so the pixels we
    // draw are already the right way up and the re-encoded file needs no EXIF.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Most commonly HEIC on Chrome/Firefox, which can't decode it. The server
    // can (libheif is in the image), so let the original through.
    return null;
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxEdge / longEdge);

    // Already small in both dimensions and bytes — re-encoding would only lose
    // quality for no benefit.
    if (scale === 1 && file.size <= reencodeAboveBytes) return null;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // White base: receipts are white paper, and flattening any alpha channel
    // onto white avoids black backgrounds when converting to JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return null;

    // If our "optimised" version somehow came out bigger, keep the original.
    if (blob.size >= file.size && scale === 1) return null;

    const name = file.name.replace(/\.[^./\\]+$/, "") || "receipt";
    return {
      file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }),
      resized: true,
      originalBytes: file.size,
    };
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

/** Human-readable size for error copy. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
