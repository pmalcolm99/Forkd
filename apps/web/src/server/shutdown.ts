import { closePool } from "@forkd/db";
import { logger } from "@forkd/shared";

const GRACE_MS = 10_000;

export async function requestShutdown(reason: string, actorId: string): Promise<never> {
  logger.info({ event: "shutdown_requested", reason, actorId }, "Graceful shutdown initiated");

  // Best-effort grace period: allows in-flight HTTP responses to flush.
  // Next.js App Router doesn't expose the underlying http.Server directly,
  // so we approximate with a fixed delay. The 500 ms delay in config.restartServer
  // ensures the tRPC response reaches the client before this function is called.
  await new Promise<void>((resolve) => setTimeout(resolve, GRACE_MS));

  // BullMQ workers: none wired yet — close them here in future phases before pool.end().

  try {
    await closePool();
    logger.info("DB pool closed");
  } catch (err) {
    logger.error({ err }, "Error closing DB pool during shutdown");
  }

  logger.info("Exiting process");
  process.exit(0);
}

// Wire OS signals to the same graceful path so `docker stop` and Ctrl-C
// both shut down cleanly, even when not triggered by the admin UI.
process.on("SIGTERM", () => {
  void requestShutdown("SIGTERM", "system");
});

process.on("SIGINT", () => {
  void requestShutdown("SIGINT", "system");
});
