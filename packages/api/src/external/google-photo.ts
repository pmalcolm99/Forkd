import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { db as dbType } from "@forkd/db";
import { restaurantPhotos, recordApiUsage } from "@forkd/db";
import {
  PHOTO_FULL_MAX,
  PHOTO_FULL_QUALITY,
  PHOTO_THUMB_QUALITY,
  PHOTO_THUMB_SIZE,
  photoStoragePath,
  photoThumbStoragePath,
} from "@forkd/shared";
import { logger } from "@forkd/shared";

const PHOTOS_BASE = "https://places.googleapis.com/v1";

function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "/app/uploads";
}

export async function fetchAndStoreGooglePhoto(
  photoName: string,
  apiKey: string,
  restaurantId: string,
  db: typeof dbType
): Promise<void> {
  const url = `${PHOTOS_BASE}/${photoName}/media?maxHeightPx=1600&key=${apiKey}`;
  const resp = await fetch(url, { redirect: "follow" });
  void recordApiUsage(db, "photo").catch(() => {});
  if (!resp.ok) throw new Error(`Google Places photo fetch returned ${resp.status}`);

  const buf = Buffer.from(await resp.arrayBuffer());
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

  const photoId = randomUUID();
  const uploadsDir = getUploadsDir();
  const dir = path.join(uploadsDir, "restaurants", restaurantId);
  await fs.mkdir(dir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(uploadsDir, photoStoragePath(restaurantId, photoId)), fullRes.data),
    fs.writeFile(path.join(uploadsDir, photoThumbStoragePath(restaurantId, photoId)), thumbBuf),
  ]);

  await db.insert(restaurantPhotos).values({
    id: photoId,
    restaurantId,
    uploadedByUserId: null,
    filePath: photoStoragePath(restaurantId, photoId),
    thumbPath: photoThumbStoragePath(restaurantId, photoId),
    width: fullRes.info.width,
    height: fullRes.info.height,
    byteSize: fullRes.data.length,
    source: "google_places",
    // Encoded with the current standard → excluded from the bulk optimizer.
    optimizedAt: new Date(),
  });

  logger.info({ restaurantId, photoId }, "Google Places photo stored");
}
