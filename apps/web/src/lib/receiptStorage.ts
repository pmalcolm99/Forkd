import fs from "node:fs/promises";
import path from "node:path";
import { receiptStoragePath, receiptThumbStoragePath } from "@forkd/shared";
import { getUploadsDir, resolveFullPath } from "./photoStorage";

export async function ensureSplitDir(splitId: string): Promise<void> {
  const dir = path.join(getUploadsDir(), "splits", splitId);
  await fs.mkdir(dir, { recursive: true });
}

export async function writeReceiptFiles(
  splitId: string,
  imageId: string,
  fullBuf: Buffer,
  thumbBuf: Buffer
): Promise<void> {
  const fullPath = resolveFullPath(receiptStoragePath(splitId, imageId));
  const thumbPath = resolveFullPath(receiptThumbStoragePath(splitId, imageId));
  await Promise.all([fs.writeFile(fullPath, fullBuf), fs.writeFile(thumbPath, thumbBuf)]);
}

export async function deleteReceiptFiles(splitId: string, imageId: string): Promise<void> {
  const fullPath = resolveFullPath(receiptStoragePath(splitId, imageId));
  const thumbPath = resolveFullPath(receiptThumbStoragePath(splitId, imageId));
  const ignoreMissing = (err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  };
  await Promise.all([
    fs.unlink(fullPath).catch(ignoreMissing),
    fs.unlink(thumbPath).catch(ignoreMissing),
  ]);
}

/** Remove the whole per-split directory once its images are gone. */
export async function removeSplitDir(splitId: string): Promise<void> {
  const dir = resolveFullPath(path.join("splits", splitId));
  await fs.rm(dir, { recursive: true, force: true });
}
