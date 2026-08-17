import { and, eq, isNull } from "drizzle-orm";
import z from "zod";
import { db, billSplits, billSplitImages } from "@forkd/db";
import { readPhotoFile } from "./photoStorage";

const FILENAME_RE = /^[0-9a-f-]{36}(_thumb)?\.webp$/;

export interface ResolvedReceiptImage {
  splitId: string;
  storagePath: string;
  hideImagesFromOthers: boolean;
  createdByUserId: string | null;
}

/**
 * Validate a receipt image path and resolve it to a row.
 *
 * Shared by the authenticated route and the guest route so the path parsing
 * and the "does this row actually exist" check can't drift apart between them.
 * Returns null for anything malformed or missing — the caller always answers
 * 404 so the two are indistinguishable from outside.
 */
export async function resolveReceiptImage(
  segments: string[]
): Promise<ResolvedReceiptImage | null> {
  // Path shape: ["splits", <splitId>, <filename>]
  if (segments.length !== 3 || segments[0] !== "splits") return null;
  const splitId = segments[1]!;
  const filename = segments[2]!;

  if (!z.string().uuid().safeParse(splitId).success) return null;
  if (!FILENAME_RE.test(filename)) return null;

  const imageId = filename.replace(/_thumb\.webp$/, "").replace(/\.webp$/, "");
  const isThumb = filename.endsWith("_thumb.webp");

  const image = await db.query.billSplitImages.findFirst({
    where: and(eq(billSplitImages.id, imageId), eq(billSplitImages.splitId, splitId)),
  });
  if (!image) return null;

  const split = await db.query.billSplits.findFirst({
    where: and(eq(billSplits.id, splitId), isNull(billSplits.deletedAt)),
    columns: { id: true, hideImagesFromOthers: true, createdByUserId: true },
  });
  if (!split) return null;

  return {
    splitId,
    storagePath: isThumb ? image.thumbPath : image.filePath,
    hideImagesFromOthers: split.hideImagesFromOthers,
    createdByUserId: split.createdByUserId,
  };
}

export async function streamReceipt(storagePath: string): Promise<Response> {
  try {
    const { stream, size } = await readPhotoFile(storagePath);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(size),
        // Receipts can carry payment details; keep them out of any index.
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
