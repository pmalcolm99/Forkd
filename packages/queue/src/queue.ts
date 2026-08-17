import { Queue } from "bullmq";
import { getRedisOptions } from "./redis";

export type ImportJobData = {
  jobId: string;
  sourceUrl: string;
  userId: string;
};

export const importQueue = new Queue<ImportJobData>("import", {
  connection: getRedisOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export type BackupJobData =
  | { type: "backup"; trigger: "manual" | "scheduled"; userId: string | null }
  | { type: "restore"; archivePath: string };

export const backupQueue = new Queue<BackupJobData>("backup", {
  connection: getRedisOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export type ReceiptJobData = {
  splitId: string;
  userId: string;
};

export const receiptQueue = new Queue<ReceiptJobData>("receipt", {
  connection: getRedisOptions(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Stable id for the single repeatable scheduled-backup entry.
export const SCHEDULED_BACKUP_JOB_NAME = "scheduled-backup";

/**
 * Reconcile the single scheduled-backup repeatable job to match the cron string.
 * Empty cron removes any existing schedule. Lives here (not the worker) so the API
 * router can call it without importing the heavy worker module. Safe to call often.
 */
export async function reconcileScheduledBackup(cron: string): Promise<void> {
  const repeatables = await backupQueue.getRepeatableJobs();
  for (const r of repeatables) {
    if (r.name === SCHEDULED_BACKUP_JOB_NAME) {
      await backupQueue.removeRepeatableByKey(r.key);
    }
  }
  const pattern = cron.trim();
  if (!pattern) return;

  await backupQueue.add(
    SCHEDULED_BACKUP_JOB_NAME,
    { type: "backup", trigger: "scheduled", userId: null },
    { repeat: { pattern } }
  );
}
