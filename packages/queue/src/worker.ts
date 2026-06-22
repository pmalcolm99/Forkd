import { Worker } from "bullmq";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db, importJobs, restaurants, getDecryptedConfigValue } from "@forkd/db";
import { logger } from "@forkd/shared";
import { getRedisOptions } from "./redis";
import type { ImportJobData } from "./queue";
import { scrapePost } from "./pipeline/scraper";
import { downloadVideo } from "./pipeline/downloader";
import { extractAudio } from "./pipeline/audioExtractor";
import { transcribeAudio } from "./pipeline/transcriber";
import { extractRestaurantInfo } from "./pipeline/extractorAi";
import { confirmWithGooglePlaces } from "./pipeline/confirmer";
import { fetchAndStoreGooglePhoto } from "./pipeline/googlePhoto";

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

    // ── Duplicate check — skip insert if a live (non-deleted) row exists ────────
    if (confirmed?.placeId) {
      const [existing] = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(and(eq(restaurants.googlePlaceId, confirmed.placeId), isNull(restaurants.deletedAt)))
        .limit(1);

      if (existing) {
        await setStatus(jobId, "duplicate_found", "Already in your list", {
          restaurantId: existing.id,
          completedAt: new Date(),
        });
        logger.info(
          { jobId, existingId: existing.id },
          "Import duplicate — restaurant already exists"
        );
        return;
      }
    }

    // ── Create draft restaurant ───────────────────────────────────────────────
    // Prefer Google-confirmed region; fall back to the AI extraction.
    const country = confirmed?.countryCode ?? extracted.country ?? "US";
    const state = confirmed?.stateCode ?? (country === "US" ? (extracted.state ?? null) : null);
    const address =
      confirmed?.formattedAddress ??
      (extracted.address || [state, country].filter(Boolean).join(", "));

    const [newRestaurant] = await db
      .insert(restaurants)
      .values({
        name: confirmed?.name ?? extracted.name,
        address,
        state: state as (typeof restaurants.$inferInsert)["state"],
        country,
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

    // Best-effort: fetch first Google Places photo. Never blocks restaurant creation.
    if (confirmed?.photoName) {
      const apiKey = await getDecryptedConfigValue("google_places.api_key", db);
      if (apiKey) {
        await fetchAndStoreGooglePhoto(confirmed.photoName, apiKey, newRestaurant.id, db).catch(
          (err) => logger.warn({ err, jobId }, "Google Places photo fetch failed — skipping")
        );
      }
    }

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

async function checkChromeReachability(): Promise<void> {
  const endpoint = process.env.CHROME_CDP_ENDPOINT;
  if (!endpoint) {
    logger.warn("CHROME_CDP_ENDPOINT is not set — scraper will fail on first job");
    return;
  }
  try {
    // Chrome's DevTools HTTP endpoint rejects non-localhost Host headers (DNS-rebinding
    // protection). Neither fetch nor undici allows overriding Host; node:http does.
    const { hostname, port } = new URL(endpoint);
    const info = await new Promise<{ Browser?: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname,
          port: parseInt(port || "80", 10),
          path: "/json/version",
          headers: { Host: "localhost" },
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk: Buffer) => (raw += chunk.toString()));
          res.on("end", () => {
            if (res.statusCode !== 200) reject(new Error(`status ${res.statusCode}`));
            else resolve(JSON.parse(raw) as { Browser?: string });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
    logger.info({ browser: info.Browser ?? "unknown" }, "Chrome reachable");
  } catch (err) {
    logger.warn(
      { err, endpoint },
      "Chrome unreachable at startup — scraper will fail on first job"
    );
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
  void checkChromeReachability();
}

// Backup/restore worker lives here too so instrumentation.ts can start everything
// from the single "@forkd/queue/worker" entrypoint.
export { startBackupWorker } from "./backupWorker";
