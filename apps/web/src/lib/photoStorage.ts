import fs from "node:fs/promises";
import path from "node:path";
import { photoStoragePath, photoThumbStoragePath } from "@forkd/shared";

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "/app/uploads";
}

export function resolveFullPath(storagePath: string): string {
  const uploadsDir = getUploadsDir();
  const resolved = path.resolve(uploadsDir, storagePath);
  if (
    !resolved.startsWith(path.resolve(uploadsDir) + path.sep) &&
    resolved !== path.resolve(uploadsDir)
  ) {
    throw new Error(`Path traversal detected: ${storagePath}`);
  }
  return resolved;
}

export async function ensureRestaurantDir(restaurantId: string): Promise<void> {
  const dir = path.join(getUploadsDir(), "restaurants", restaurantId);
  await fs.mkdir(dir, { recursive: true });
}

export async function writePhotoFiles(
  restaurantId: string,
  photoId: string,
  fullBuf: Buffer,
  thumbBuf: Buffer
): Promise<void> {
  const fullPath = resolveFullPath(photoStoragePath(restaurantId, photoId));
  const thumbPath = resolveFullPath(photoThumbStoragePath(restaurantId, photoId));
  await Promise.all([fs.writeFile(fullPath, fullBuf), fs.writeFile(thumbPath, thumbBuf)]);
}

export async function deletePhotoFiles(restaurantId: string, photoId: string): Promise<void> {
  const fullPath = resolveFullPath(photoStoragePath(restaurantId, photoId));
  const thumbPath = resolveFullPath(photoThumbStoragePath(restaurantId, photoId));
  await Promise.all([
    fs.unlink(fullPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    }),
    fs.unlink(thumbPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    }),
  ]);
}

export async function readPhotoFile(
  storagePath: string
): Promise<{ stream: ReadableStream; size: number }> {
  const fullPath = resolveFullPath(storagePath);
  const stat = await fs.stat(fullPath);
  const nodeStream = (await import("node:fs")).createReadStream(fullPath);
  const stream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(chunk));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
  return { stream, size: stat.size };
}
