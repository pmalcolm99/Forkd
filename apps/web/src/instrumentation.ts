export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Import from the worker subpath to avoid webpack tracing playwright-core
    // through the main @forkd/queue entrypoint used by the API router.
    const { startImportWorker } = await import("@forkd/queue/worker");
    startImportWorker();
  }
}
