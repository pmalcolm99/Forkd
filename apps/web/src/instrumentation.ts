export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import from the worker subpath to avoid webpack tracing playwright-core
    // through the main @forkd/queue entrypoint used by the API router.
    const { startImportWorker, startBackupWorker } = await import("@forkd/queue/worker");
    startImportWorker();
    startBackupWorker();

    // Register the scheduled-backup repeatable job from the stored cron config.
    try {
      const { reconcileScheduledBackup } = await import("@forkd/queue");
      const { db, getDecryptedConfigValue } = await import("@forkd/db");
      const cron = (await getDecryptedConfigValue("backup.schedule_cron", db)) ?? "";
      await reconcileScheduledBackup(cron);
    } catch (err) {
      // Non-fatal: scheduling can be (re)applied later from the admin UI.
      console.error("Failed to register scheduled backup", err);
    }
  }
}
