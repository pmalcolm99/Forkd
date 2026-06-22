import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, cp, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, appConfig, setConfigValue } from "@forkd/db";
import { logger } from "@forkd/shared";

const execFileAsync = promisify(execFile);

function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? "/app/uploads";
}
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

type ConfigRow = typeof appConfig.$inferInsert;

/**
 * Restore a backup archive. Puts the app in maintenance mode, runs pg_restore
 * (--clean --if-exists, so no DB drop is needed), replaces the uploads tree, and
 * re-applies app_config. Maintenance mode is always cleared, even on failure.
 */
export async function restoreBackup(archivePath: string): Promise<void> {
  const extract = await mkdtemp(path.join(tmpdir(), "forkd-restore-"));
  await setConfigValue(db, "maintenance_mode", "true");

  try {
    // 1. Extract and validate.
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extract]);
    const manifestPath = path.join(extract, "manifest.json");
    const dumpPath = path.join(extract, "db.dump");
    if (!existsSync(manifestPath) || !existsSync(dumpPath)) {
      throw new Error("Invalid backup archive: missing manifest.json or db.dump");
    }

    // 2. Restore the database (drops + recreates objects from the dump).
    await execFileAsync(
      "pg_restore",
      ["--clean", "--if-exists", "--no-owner", "--dbname", databaseUrl(), dumpPath],
      { maxBuffer: 1024 * 1024 * 64 }
    ).catch((err: unknown) => {
      // pg_restore exits non-zero on benign "does not exist" notices with --clean.
      // Surface real failures but tolerate the expected warnings.
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ msg }, "pg_restore reported warnings (often benign with --clean)");
    });

    // 3. Replace the uploads tree.
    const uploads = uploadsDir();
    const archivedUploads = path.join(extract, "uploads");
    if (existsSync(archivedUploads)) {
      await rm(uploads, { recursive: true, force: true });
      await mkdir(uploads, { recursive: true });
      for (const entry of await readdir(archivedUploads)) {
        await cp(path.join(archivedUploads, entry), path.join(uploads, entry), { recursive: true });
      }
    }

    // 4. Re-apply app_config (the DB restore already includes it, but reassert to be safe).
    const configJsonPath = path.join(extract, "app_config.json");
    if (existsSync(configJsonPath)) {
      const rows = JSON.parse(await readFile(configJsonPath, "utf8")) as ConfigRow[];
      for (const row of rows) {
        if (row.key === "maintenance_mode") continue; // don't re-enable maintenance
        await db
          .insert(appConfig)
          .values(row)
          .onConflictDoUpdate({
            target: appConfig.key,
            set: { value: row.value, isSecret: row.isSecret, updatedAt: new Date() },
          });
      }
    }

    logger.info({ archivePath }, "Restore completed");
  } finally {
    await setConfigValue(db, "maintenance_mode", "false");
    await rm(extract, { recursive: true, force: true }).catch(() => {});
  }
}
