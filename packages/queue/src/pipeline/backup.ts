import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, cp, writeFile, stat, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, appConfig, backups } from "@forkd/db";
import { logger } from "@forkd/shared";

const execFileAsync = promisify(execFile);

function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "/app/uploads";
}
function backupsDir(): string {
  return process.env.BACKUPS_DIR ?? "/app/backups";
}
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export type BackupTrigger = "manual" | "scheduled";

/**
 * Create a full backup archive: forkd-backup-<ISO>.tar.gz containing a custom-format
 * pg_dump (db.dump), a copy of the uploads tree, an app_config dump (encrypted values
 * left as-is), and a manifest. Records the result in the `backups` table and prunes
 * old backups per the retention policy. Returns the created filename.
 */
export async function createBackup(
  trigger: BackupTrigger,
  triggeredByUserId: string | null
): Promise<{ filename: string; byteSize: number }> {
  await mkdir(backupsDir(), { recursive: true });
  const staging = await mkdtemp(path.join(tmpdir(), "forkd-backup-"));

  try {
    // 1. Database dump (custom format — compressed, restorable with pg_restore).
    const dumpPath = path.join(staging, "db.dump");
    await execFileAsync(
      "pg_dump",
      ["--format=custom", "--file", dumpPath, "--dbname", databaseUrl()],
      {
        maxBuffer: 1024 * 1024 * 64,
      }
    );

    // 2. Uploaded photos.
    const uploads = uploadsDir();
    if (existsSync(uploads)) {
      await cp(uploads, path.join(staging, "uploads"), { recursive: true });
    } else {
      await mkdir(path.join(staging, "uploads"), { recursive: true });
    }

    // 3. app_config (encrypted values left encrypted — useless without MASTER_KEY).
    const configRows = await db.select().from(appConfig);
    await writeFile(path.join(staging, "app_config.json"), JSON.stringify(configRows, null, 2));

    // 4. Manifest.
    const createdAt = new Date().toISOString();
    const manifest = {
      app: "Forkd",
      appVersion: process.env.APP_VERSION ?? "unknown",
      createdAt,
      trigger,
      contents: ["db.dump", "uploads/", "app_config.json"],
    };
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));

    // 5. Tar + gzip the staging directory into the backups volume.
    const filename = `forkd-backup-${createdAt.replace(/[:.]/g, "-")}.tar.gz`;
    const archivePath = path.join(backupsDir(), filename);
    await execFileAsync("tar", ["-czf", archivePath, "-C", staging, "."]);

    const { size } = await stat(archivePath);

    // 6. Record + prune.
    await db.insert(backups).values({
      filename,
      byteSize: BigInt(size),
      trigger,
      triggeredByUserId,
    });
    await pruneBackups();

    logger.info({ filename, size, trigger }, "Backup created");
    return { filename, byteSize: size };
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

const HARD_CAP_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/** Soft-delete + unlink backups beyond the retention count or the 10 GB cap. */
export async function pruneBackups(): Promise<void> {
  const retention = Number(
    (await db.select().from(appConfig)).find((r) => r.key === "backup.retention_count")?.value ??
      "30"
  );
  const keep = Number.isFinite(retention) && retention > 0 ? retention : 30;

  const live = await db
    .select()
    .from(backups)
    .where(isNull(backups.deletedAt))
    .orderBy(desc(backups.createdAt));

  const toDelete: typeof live = [];
  let runningBytes = 0;
  live.forEach((row, idx) => {
    runningBytes += Number(row.byteSize);
    if (idx >= keep || runningBytes > HARD_CAP_BYTES) toDelete.push(row);
  });

  for (const row of toDelete) {
    await unlink(path.join(backupsDir(), row.filename)).catch(() => {});
    await db
      .update(backups)
      .set({ deletedAt: new Date() })
      .where(and(isNull(backups.deletedAt), eq(backups.id, row.id)));
  }
  if (toDelete.length > 0) logger.info({ pruned: toDelete.length }, "Pruned old backups");
}

/** List the actual .tar.gz files present in the backups directory. */
export async function listBackupFiles(): Promise<string[]> {
  const dir = backupsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith(".tar.gz"));
}
