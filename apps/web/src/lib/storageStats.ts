import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getUploadsDir, resolveFullPath } from "./photoStorage";

function getBackupsDir(): string {
  return process.env.BACKUPS_DIR ?? "/app/backups";
}

/** Recursively sum the byte size of every file under `dir`. Missing dir → 0. */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) total += stat.size;
    }
  }
  return total;
}

export interface StorageUsage {
  uploadsBytes: number;
  backupsBytes: number;
  diskTotalBytes: number;
  diskFreeBytes: number;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const uploadsDir = getUploadsDir();
  const [uploadsBytes, backupsBytes, fsStat] = await Promise.all([
    dirSize(uploadsDir),
    dirSize(getBackupsDir()),
    fs.statfs(uploadsDir),
  ]);
  return {
    uploadsBytes,
    backupsBytes,
    diskTotalBytes: fsStat.bsize * fsStat.blocks,
    // bavail = blocks available to unprivileged users — the practical "free" figure.
    diskFreeBytes: fsStat.bsize * fsStat.bavail,
  };
}

export interface UploadFile {
  relPath: string;
  byteSize: number;
  mtimeMs: number;
}

/**
 * Walk the uploads directory and return every file with its path relative to the
 * uploads root (forward-slashed, matching how filePath/thumbPath are stored in the
 * DB). The storage router diffs this against DB records to find orphans.
 */
export async function listAllUploadFiles(): Promise<UploadFile[]> {
  const uploadsDir = getUploadsDir();
  const out: UploadFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full).catch(() => null);
        if (!stat) continue;
        const relPath = path.relative(uploadsDir, full).split(path.sep).join("/");
        out.push({ relPath, byteSize: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  }

  await walk(uploadsDir);
  return out;
}

/** Delete a single file under the uploads dir. Traversal-guarded via resolveFullPath. */
export async function deleteUploadFile(relPath: string): Promise<void> {
  const full = resolveFullPath(relPath);
  await fs.unlink(full).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
}

export interface OrphanVideoCleanup {
  count: number;
  freedBytes: number;
}

/**
 * Remove leftover transcription download directories. The import worker downloads
 * social videos into `mkdtemp(os.tmpdir(), "forkd-import-")` and removes them in a
 * finally block, so these only exist if a job crashed hard. They live in ephemeral
 * /tmp, so this is best-effort housekeeping.
 */
export async function clearOrphanedVideos(): Promise<OrphanVideoCleanup> {
  const tmp = os.tmpdir();
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(tmp, { withFileTypes: true });
  } catch {
    return { count: 0, freedBytes: 0 };
  }

  let count = 0;
  let freedBytes = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("forkd-import-")) continue;
    const full = path.join(tmp, entry.name);
    freedBytes += await dirSize(full);
    await fs.rm(full, { recursive: true, force: true }).catch(() => {});
    count += 1;
  }
  return { count, freedBytes };
}
