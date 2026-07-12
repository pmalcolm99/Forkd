import { TRPCError } from "@trpc/server";
import { count, desc, eq, isNotNull, isNull, sql, sum } from "drizzle-orm";
import type { db as DbType } from "@forkd/db";
import { getDecryptedConfigValue, restaurantPhotos, restaurants, setConfigValue } from "@forkd/db";
import { deleteOrphanFileInput, deleteStoragePhotoInput, logger } from "@forkd/shared";
import { adminProcedure, router } from "../trpc";

// ── Bulk photo optimization (re-encode existing photos; reversible) ───────────
// Detached background loop (mirrors runBulkMetadataRefresh); progress in app_config.

const OPTIMIZE_STATUS_KEY = "photo_optimize.status";
const OPTIMIZE_STALE_MS = 2 * 60 * 60 * 1000; // 2h — optimizing many photos is slow
const DISK_MARGIN_BYTES = 500 * 1024 * 1024; // keep 500MB headroom after backups

type OptimizePhase = "idle" | "running" | "awaiting_finalize";
interface OptimizeStatus {
  phase: OptimizePhase;
  total: number;
  done: number;
  failed: number;
  originalBytes: number;
  optimizedBytes: number;
  startedAt: string | null;
  finishedAt: string | null;
}
const OPTIMIZE_IDLE: OptimizeStatus = {
  phase: "idle",
  total: 0,
  done: 0,
  failed: 0,
  originalBytes: 0,
  optimizedBytes: 0,
  startedAt: null,
  finishedAt: null,
};

function parseOptimizeStatus(raw: string | null): OptimizeStatus {
  if (!raw) return OPTIMIZE_IDLE;
  try {
    return { ...OPTIMIZE_IDLE, ...(JSON.parse(raw) as Partial<OptimizeStatus>) };
  } catch {
    return OPTIMIZE_IDLE;
  }
}

type OptimizeFileStore = {
  backupAndOptimizePhoto: (f: string, t: string) => Promise<{ byteSize: number }>;
};

async function runPhotoOptimize(
  db: typeof DbType,
  fileStore: OptimizeFileStore,
  startedAt: string
): Promise<void> {
  let total = 0;
  let done = 0;
  let failed = 0;
  let originalBytes = 0;
  let optimizedBytes = 0;
  const write = (phase: OptimizePhase) =>
    setConfigValue(
      db,
      OPTIMIZE_STATUS_KEY,
      JSON.stringify({
        phase,
        total,
        done,
        failed,
        originalBytes,
        optimizedBytes,
        startedAt,
        finishedAt: phase === "running" ? null : new Date().toISOString(),
      } satisfies OptimizeStatus)
    ).catch(() => {});

  try {
    const rows = await db
      .select({
        id: restaurantPhotos.id,
        filePath: restaurantPhotos.filePath,
        thumbPath: restaurantPhotos.thumbPath,
        byteSize: restaurantPhotos.byteSize,
      })
      .from(restaurantPhotos)
      .where(isNull(restaurantPhotos.optimizedAt));
    total = rows.length;
    await write("running");

    for (const p of rows) {
      try {
        const { byteSize } = await fileStore.backupAndOptimizePhoto(p.filePath, p.thumbPath);
        await db
          .update(restaurantPhotos)
          .set({ originalByteSize: p.byteSize, byteSize, optimizedAt: new Date() })
          .where(eq(restaurantPhotos.id, p.id));
        originalBytes += p.byteSize;
        optimizedBytes += byteSize;
      } catch (err) {
        failed += 1;
        logger.warn({ err, photoId: p.id }, "Photo optimize failed");
      }
      done += 1;
      await write("running");
      await new Promise((res) => setTimeout(res, 80)); // pace to spare CPU
    }

    await write(done > failed ? "awaiting_finalize" : "idle");
    logger.info({ total, failed, originalBytes, optimizedBytes }, "Photo optimize complete");
  } catch (err) {
    logger.error({ err }, "Photo optimize crashed");
    await write(total > 0 ? "awaiting_finalize" : "idle");
  }
}

export const storageRouter = router({
  // Disk usage summary — the headline is free space (the prod outage was a full disk).
  usage: adminProcedure.query(async ({ ctx }) => {
    if (!ctx.fileStore?.getStorageUsage) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage stats unavailable" });
    }

    const [fsUsage, dbSizeRes, agg] = await Promise.all([
      ctx.fileStore.getStorageUsage(),
      ctx.db.execute(sql`SELECT pg_database_size(current_database()) AS bytes`),
      ctx.db.select({ c: count(), bytes: sum(restaurantPhotos.byteSize) }).from(restaurantPhotos),
    ]);

    const dbRows = dbSizeRes as unknown as { rows: { bytes: string | number }[] };
    const dbBytes = Number(dbRows.rows[0]?.bytes ?? 0);

    return {
      diskTotalBytes: fsUsage.diskTotalBytes,
      diskFreeBytes: fsUsage.diskFreeBytes,
      diskUsedBytes: fsUsage.diskTotalBytes - fsUsage.diskFreeBytes,
      uploadsBytes: fsUsage.uploadsBytes,
      backupsBytes: fsUsage.backupsBytes,
      dbBytes,
      photoCount: agg[0]?.c ?? 0,
      photoBytes: Number(agg[0]?.bytes ?? 0),
    };
  }),

  // Media browser: all DB-tracked photos plus orphaned files on disk with no DB row.
  listMedia: adminProcedure.query(async ({ ctx }) => {
    const photos = await ctx.db
      .select({
        photoId: restaurantPhotos.id,
        restaurantId: restaurantPhotos.restaurantId,
        restaurantName: restaurants.name,
        source: restaurantPhotos.source,
        byteSize: restaurantPhotos.byteSize,
        width: restaurantPhotos.width,
        height: restaurantPhotos.height,
        createdAt: restaurantPhotos.createdAt,
        filePath: restaurantPhotos.filePath,
        thumbPath: restaurantPhotos.thumbPath,
      })
      .from(restaurantPhotos)
      .innerJoin(restaurants, eq(restaurantPhotos.restaurantId, restaurants.id))
      .orderBy(desc(restaurantPhotos.createdAt));

    let orphans: { relPath: string; byteSize: number; mtimeMs: number }[] = [];
    if (ctx.fileStore?.listAllUploadFiles) {
      const known = new Set<string>();
      for (const p of photos) {
        known.add(p.filePath);
        known.add(p.thumbPath);
      }
      const allFiles = await ctx.fileStore.listAllUploadFiles();
      orphans = allFiles.filter((f) => !known.has(f.relPath));
    }

    return {
      // Omit filePath/thumbPath (used only for the orphan diff above) from the response.
      photos: photos.map((p) => ({
        photoId: p.photoId,
        restaurantId: p.restaurantId,
        restaurantName: p.restaurantName,
        source: p.source,
        byteSize: p.byteSize,
        width: p.width,
        height: p.height,
        createdAt: p.createdAt,
      })),
      orphans,
    };
  }),

  deletePhoto: adminProcedure.input(deleteStoragePhotoInput).mutation(async ({ input, ctx }) => {
    const photo = await ctx.db.query.restaurantPhotos.findFirst({
      where: eq(restaurantPhotos.id, input.photoId),
    });
    if (!photo) throw new TRPCError({ code: "NOT_FOUND" });

    try {
      await ctx.fileStore?.deletePhotoFiles(photo.restaurantId, photo.id);
    } catch (err) {
      logger.error(
        { photoId: photo.id, restaurantId: photo.restaurantId, err },
        "Failed to delete photo files"
      );
    }

    await ctx.db.delete(restaurantPhotos).where(eq(restaurantPhotos.id, photo.id));
    // Clear cover reference if this was the restaurant's cover photo.
    await ctx.db
      .update(restaurants)
      .set({ coverPhotoId: null })
      .where(eq(restaurants.coverPhotoId, photo.id));

    return { success: true };
  }),

  deleteOrphanFile: adminProcedure.input(deleteOrphanFileInput).mutation(async ({ input, ctx }) => {
    if (!ctx.fileStore?.deleteUploadFile) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage unavailable" });
    }
    await ctx.fileStore.deleteUploadFile(input.relPath);
    return { success: true };
  }),

  clearOrphanedVideos: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.fileStore?.clearOrphanedVideos) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage unavailable" });
    }
    return ctx.fileStore.clearOrphanedVideos();
  }),

  optimizeStatus: adminProcedure.query(async ({ ctx }) => {
    const status = parseOptimizeStatus(await getDecryptedConfigValue(OPTIMIZE_STATUS_KEY, ctx.db));
    const [pending] = await ctx.db
      .select({ c: count(), bytes: sum(restaurantPhotos.byteSize) })
      .from(restaurantPhotos)
      .where(isNull(restaurantPhotos.optimizedAt));
    return {
      ...status,
      pendingCount: pending?.c ?? 0,
      pendingBytes: Number(pending?.bytes ?? 0),
    };
  }),

  optimizeAll: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.fileStore?.backupAndOptimizePhoto || !ctx.fileStore.getStorageUsage) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage unavailable" });
    }
    const current = parseOptimizeStatus(await getDecryptedConfigValue(OPTIMIZE_STATUS_KEY, ctx.db));
    if (
      current.phase === "running" &&
      current.startedAt &&
      Date.now() - Date.parse(current.startedAt) < OPTIMIZE_STALE_MS
    ) {
      return { started: false as const, reason: "already_running" as const };
    }
    if (current.phase === "awaiting_finalize") {
      return { started: false as const, reason: "awaiting_finalize" as const };
    }

    const [pending] = await ctx.db
      .select({ c: count(), bytes: sum(restaurantPhotos.byteSize) })
      .from(restaurantPhotos)
      .where(isNull(restaurantPhotos.optimizedAt));
    const pendingCount = pending?.c ?? 0;
    const pendingBytes = Number(pending?.bytes ?? 0);
    if (pendingCount === 0) return { started: false as const, reason: "nothing_to_do" as const };

    // Pre-flight: refuse if backing up the originals would leave too little free disk.
    const usage = await ctx.fileStore.getStorageUsage();
    if (usage.diskFreeBytes < pendingBytes + DISK_MARGIN_BYTES) {
      return {
        started: false as const,
        reason: "insufficient_disk" as const,
        needBytes: pendingBytes + DISK_MARGIN_BYTES,
        freeBytes: usage.diskFreeBytes,
      };
    }

    const startedAt = new Date().toISOString();
    await setConfigValue(
      ctx.db,
      OPTIMIZE_STATUS_KEY,
      JSON.stringify({ ...OPTIMIZE_IDLE, phase: "running", total: pendingCount, startedAt })
    );
    const store = { backupAndOptimizePhoto: ctx.fileStore.backupAndOptimizePhoto };
    void runPhotoOptimize(ctx.db, store, startedAt);
    return { started: true as const };
  }),

  finalizeOptimization: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.fileStore?.deleteOriginals) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage unavailable" });
    }
    const { freedBytes } = await ctx.fileStore.deleteOriginals();
    // Clear the pre-optimization sizes; the run is done and can no longer revert.
    await ctx.db
      .update(restaurantPhotos)
      .set({ originalByteSize: null })
      .where(isNotNull(restaurantPhotos.originalByteSize));
    await setConfigValue(ctx.db, OPTIMIZE_STATUS_KEY, JSON.stringify(OPTIMIZE_IDLE));
    return { freedBytes };
  }),

  revertOptimization: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.fileStore?.restoreOriginal || !ctx.fileStore.deleteOriginals) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage unavailable" });
    }
    const rows = await ctx.db
      .select({
        id: restaurantPhotos.id,
        filePath: restaurantPhotos.filePath,
        thumbPath: restaurantPhotos.thumbPath,
        originalByteSize: restaurantPhotos.originalByteSize,
      })
      .from(restaurantPhotos)
      .where(isNotNull(restaurantPhotos.originalByteSize));

    for (const p of rows) {
      await ctx.fileStore.restoreOriginal(p.filePath, p.thumbPath);
      await ctx.db
        .update(restaurantPhotos)
        .set({ byteSize: p.originalByteSize ?? 0, originalByteSize: null, optimizedAt: null })
        .where(eq(restaurantPhotos.id, p.id));
    }
    await ctx.fileStore.deleteOriginals();
    await setConfigValue(ctx.db, OPTIMIZE_STATUS_KEY, JSON.stringify(OPTIMIZE_IDLE));
    return { reverted: rows.length };
  }),
});
