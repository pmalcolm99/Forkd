import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  PHOTO_FULL_MAX,
  PHOTO_FULL_QUALITY,
  PHOTO_THUMB_QUALITY,
  PHOTO_THUMB_SIZE,
} from "@forkd/shared";
import { getUploadsDir, resolveFullPath } from "./photoStorage";

// Originals are backed up here (mirroring the uploads structure) so a bulk
// optimization can be reverted before it's finalized.
const ORIGINALS_PREFIX = "originals";

function originalRelPath(relPath: string): string {
  return `${ORIGINALS_PREFIX}/${relPath}`;
}

async function copyFile(fromRel: string, toRel: string): Promise<void> {
  const from = resolveFullPath(fromRel);
  const to = resolveFullPath(toRel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

/**
 * Back up a photo's current full + thumb, then re-encode both in place at the
 * current standard (1600px q78 full, 400px thumb regenerated from the full).
 * Returns the new full-size byte length. Idempotent-safe: if a backup already
 * exists it is not overwritten (so a re-run can't lose the true original).
 */
export async function backupAndOptimizePhoto(
  filePath: string,
  thumbPath: string
): Promise<{ byteSize: number }> {
  // 1. Back up originals (skip if already backed up).
  for (const rel of [filePath, thumbPath]) {
    const backupRel = originalRelPath(rel);
    try {
      await fs.access(resolveFullPath(backupRel));
    } catch {
      await copyFile(rel, backupRel);
    }
  }

  // 2. Re-encode from the current full-size image.
  const fullAbs = resolveFullPath(filePath);
  const thumbAbs = resolveFullPath(thumbPath);
  const src = await fs.readFile(fullAbs);
  const base = sharp(src).rotate();

  const [fullBuf, thumbBuf] = await Promise.all([
    base
      .clone()
      .resize(PHOTO_FULL_MAX, PHOTO_FULL_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: PHOTO_FULL_QUALITY })
      .toBuffer(),
    base
      .clone()
      .resize(PHOTO_THUMB_SIZE, PHOTO_THUMB_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: PHOTO_THUMB_QUALITY })
      .toBuffer(),
  ]);

  await Promise.all([fs.writeFile(fullAbs, fullBuf), fs.writeFile(thumbAbs, thumbBuf)]);
  return { byteSize: fullBuf.length };
}

/** Restore a photo's backed-up originals over the optimized files. */
export async function restoreOriginal(filePath: string, thumbPath: string): Promise<void> {
  for (const rel of [filePath, thumbPath]) {
    const backupRel = originalRelPath(rel);
    try {
      await fs.copyFile(resolveFullPath(backupRel), resolveFullPath(rel));
    } catch {
      // Missing backup — nothing to restore for this file.
    }
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else {
      const st = await fs.stat(full).catch(() => null);
      if (st) total += st.size;
    }
  }
  return total;
}

/** Total bytes currently held by the originals backup. */
export async function originalsSizeBytes(): Promise<number> {
  return dirSize(path.join(getUploadsDir(), ORIGINALS_PREFIX));
}

/** Delete the entire originals backup (finalize). Returns bytes freed. */
export async function deleteOriginals(): Promise<{ freedBytes: number }> {
  const dir = path.join(getUploadsDir(), ORIGINALS_PREFIX);
  const freedBytes = await dirSize(dir);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  return { freedBytes };
}
