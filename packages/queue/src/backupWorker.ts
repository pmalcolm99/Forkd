import { Worker } from "bullmq";
import { logger } from "@forkd/shared";
import { getRedisOptions } from "./redis";
import { type BackupJobData } from "./queue";
import { createBackup } from "./pipeline/backup";
import { restoreBackup } from "./pipeline/restore";

async function processBackupJob(data: BackupJobData): Promise<void> {
  if (data.type === "backup") {
    await createBackup(data.trigger, data.userId);
  } else {
    await restoreBackup(data.archivePath);
  }
}

let started = false;

/** Start the worker that processes backup + restore jobs. Idempotent. */
export function startBackupWorker(): void {
  if (started) return;
  started = true;

  const worker = new Worker<BackupJobData>(
    "backup",
    async (job) => {
      // Scheduled repeatable jobs arrive with the data we configured below.
      const data = (job.data ?? {
        type: "backup",
        trigger: "scheduled",
        userId: null,
      }) as BackupJobData;
      await processBackupJob(data);
    },
    // Concurrency 1: backups/restores are heavy and must not overlap.
    { connection: getRedisOptions(), concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Backup job failed");
  });

  logger.info("Backup worker started");
}
