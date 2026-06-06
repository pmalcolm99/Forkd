import { Worker } from "bullmq";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, importJobs, restaurants } from "@forkd/db";
import { logger } from "@forkd/shared";
import { getRedisOptions } from "./redis";
import type { ImportJobData } from "./queue";
import { scrapePost } from "./pipeline/scraper";
import { downloadVideo } from "./pipeline/downloader";
import { extractAudio } from "./pipeline/audioExtractor";
import { transcribeAudio } from "./pipeline/transcriber";
import { extractRestaurantInfo } from "./pipeline/extractorAi";
import { confirmWithGooglePlaces } from "./pipeline/confirmer";

async function setStatus(
  jobId: string,
  status: (typeof importJobs.$inferInsert)["status"],
  step: string,
  extra?: { errorMessage?: string; restaurantId?: string; completedAt?: Date }
): Promise<void> {
  await db
    .update(importJobs)
    .set({ status, step, updatedAt: new Date(), ...extra })
    .where(eq(importJobs.id, jobId))
    .catch((err) => logger.error({ err, jobId }, "Failed to update import_jobs status"));
}

async function processImport(data: ImportJobData): Promise<void> {
  const { jobId, sourceUrl, userId } = data;
  const maxSecs = parseInt(process.env.VIDEO_MAX_LENGTH_SECONDS ?? "120", 10);
  const videoEnabled = process.env.VIDEO_PARSING_ENABLED !== "false";

  const tmpDir = await mkdtemp(path.join(tmpdir(), "forkd-import-"));
  try {
    // ── Scrape ───────────────────────────────────────────────────────────────
    await setStatus(jobId, "downloading", "Scraping post...");
    const { title, bodyText } = await scrapePost(sourceUrl);

    // ── Download ─────────────────────────────────────────────────────────────
    let videoPath: string | null = null;
    if (videoEnabled) {
      try {
        videoPath = await downloadVideo(sourceUrl, tmpDir, maxSecs);
      } catch (err) {
        logger.warn({ err, jobId }, "Video download failed, proceeding without video");
      }
    }

    // ── Transcribe ───────────────────────────────────────────────────────────
    let transcript = "";
    if (videoPath) {
      await setStatus(jobId, "transcribing", "Transcribing audio...");
      const audioPath = await extractAudio(videoPath, tmpDir);
      transcript = await transcribeAudio(audioPath, db);
    }

    // ── AI extraction ────────────────────────────────────────────────────────
    await setStatus(jobId, "extracting", "Extracting restaurant info...");
    const postText = [title, bodyText].filter(Boolean).join("\n\n");
    const extracted = await extractRestaurantInfo(postText, transcript, db);

    // ── Google Places confirmation (best-effort) ──────────────────────────────
    const query = [extracted.name, extracted.address, extracted.state].filter(Boolean).join(" ");
    const confirmed = await confirmWithGooglePlaces(query, db);

    // ── Create draft restaurant ───────────────────────────────────────────────
    const address = confirmed?.formattedAddress ?? (extracted.address || `${extracted.state}, USA`);

    const [newRestaurant] = await db
      .insert(restaurants)
      .values({
        name: confirmed?.name ?? extracted.name,
        address,
        state: extracted.state as (typeof restaurants.$inferInsert)["state"],
        description: extracted.description || null,
        status: "want_to_try",
        socialUrl: sourceUrl,
        addedByUserId: userId,
        googlePlaceId: confirmed?.placeId ?? null,
        googleRating: confirmed?.rating != null ? String(confirmed.rating) : null,
        googleRatingFetchedAt: confirmed?.rating != null ? new Date() : null,
        latitude: confirmed?.latitude != null ? String(confirmed.latitude) : null,
        longitude: confirmed?.longitude != null ? String(confirmed.longitude) : null,
      })
      .returning();

    if (!newRestaurant) throw new Error("Restaurant insert returned no rows");

    await setStatus(jobId, "completed", "Done", {
      restaurantId: newRestaurant.id,
      completedAt: new Date(),
    });

    logger.info({ jobId, restaurantId: newRestaurant.id }, "Import job completed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, jobId }, "Import job failed");
    await setStatus(jobId, "failed", "Failed", {
      errorMessage: msg,
      completedAt: new Date(),
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function startImportWorker(): void {
  const worker = new Worker<ImportJobData>("import", (job) => processImport(job.data), {
    connection: getRedisOptions(),
    concurrency: 2,
    stalledInterval: 30_000,
    maxStalledCount: 1,
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.data.jobId, err }, "BullMQ worker reported job failure");
  });

  logger.info("Import worker started");
}
