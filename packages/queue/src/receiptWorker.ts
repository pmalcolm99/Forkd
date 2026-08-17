import { Worker } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db, billSplits, billSplitImages, billSplitItems } from "@forkd/db";
import { logger } from "@forkd/shared";
import { getRedisOptions } from "./redis";
import type { ReceiptJobData } from "./queue";
import { extractReceipt, type ReceiptImageInput } from "./pipeline/receiptExtractor";

function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "/app/uploads";
}

/**
 * Read a receipt image off the uploads volume as base64 for the vision call.
 *
 * The path comes from our own DB row (written by the upload handler), never
 * from user input, but it is still resolved and bounds-checked so a corrupted
 * row can't be turned into an arbitrary file read.
 */
async function loadImage(relPath: string): Promise<ReceiptImageInput | null> {
  const uploadsDir = path.resolve(getUploadsDir());
  const resolved = path.resolve(uploadsDir, relPath);
  if (!resolved.startsWith(uploadsDir + path.sep)) {
    logger.warn({ event: "receipt_path_escape", relPath }, "Refusing to read outside uploads dir");
    return null;
  }
  try {
    const buf = await fs.readFile(resolved);
    return { mediaType: "image/webp", base64: buf.toString("base64") };
  } catch (err) {
    logger.warn({ event: "receipt_image_read_failed", relPath, err }, "Receipt image unreadable");
    return null;
  }
}

async function processReceipt(data: ReceiptJobData): Promise<void> {
  const { splitId } = data;

  const split = await db.query.billSplits.findFirst({
    where: eq(billSplits.id, splitId),
  });
  if (!split || split.deletedAt) {
    logger.warn({ event: "receipt_split_missing", splitId }, "Split gone before extraction ran");
    return;
  }

  await db
    .update(billSplits)
    .set({ aiStatus: "processing", aiError: null, updatedAt: new Date() })
    .where(eq(billSplits.id, splitId));

  try {
    const imageRows = await db
      .select()
      .from(billSplitImages)
      .where(eq(billSplitImages.splitId, splitId))
      .orderBy(asc(billSplitImages.position));

    if (imageRows.length === 0) {
      throw new Error("No receipt photos to read — add a photo and try again.");
    }

    const loaded = await Promise.all(imageRows.map((r) => loadImage(r.filePath)));
    const images = loaded.filter((i): i is ReceiptImageInput => i !== null);
    if (images.length === 0) {
      throw new Error("The receipt photos could not be read from storage.");
    }

    const result = await extractReceipt(images, db);

    // Replace the item list wholesale. Re-running extraction is an explicit
    // user action ("read it again"), so discarding the previous parse is the
    // expected behaviour — but claims are keyed to item ids, so this also
    // clears any claims made against the old items via ON DELETE CASCADE.
    await db.transaction(async (tx) => {
      await tx.delete(billSplitItems).where(eq(billSplitItems.splitId, splitId));

      if (result.items.length > 0) {
        await tx.insert(billSplitItems).values(
          result.items.map((it, i) => ({
            splitId,
            position: i,
            label: it.label,
            quantity: String(it.quantity),
            unitPriceCents: it.unitPriceCents,
            totalCents: it.totalCents,
          }))
        );
      }

      await tx
        .update(billSplits)
        .set({
          merchantName: result.merchantName ?? split.merchantName,
          purchasedAt: result.purchasedAt ?? split.purchasedAt,
          currency: result.currency,
          // A non-home currency needs a decision from the user before any
          // conversion happens; the review step prompts for it.
          fxMode: result.currency === split.homeCurrency ? "none" : split.fxMode,
          subtotalCents: result.subtotalCents,
          taxIncluded: result.taxIncluded,
          taxCents: result.taxCents,
          tipCents: result.tipCents,
          serviceCents: result.serviceCents,
          discountCents: result.discountCents,
          totalCents: result.totalCents,
          aiStatus: "ready",
          aiError: null,
          updatedAt: new Date(),
        })
        .where(eq(billSplits.id, splitId));
    });

    logger.info(
      { event: "receipt_extracted", splitId, items: result.items.length, conf: result.confidence },
      "Receipt extraction complete"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receipt extraction failed";
    logger.error({ event: "receipt_extract_failed", splitId, err }, "Receipt extraction failed");
    await db
      .update(billSplits)
      .set({ aiStatus: "failed", aiError: message, updatedAt: new Date() })
      .where(eq(billSplits.id, splitId));
  }
}

let started = false;

/** Start the worker that reads receipt photos with Claude. Idempotent. */
export function startReceiptWorker(): void {
  if (started) return;
  started = true;

  const worker = new Worker<ReceiptJobData>("receipt", (job) => processReceipt(job.data), {
    connection: getRedisOptions(),
    concurrency: 2,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  });

  worker.on("failed", (job, err) => {
    logger.error({ splitId: job?.data.splitId, err }, "Receipt job failed");
  });

  logger.info("Receipt worker started");
}
