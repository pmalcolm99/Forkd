import { TRPCError } from "@trpc/server";
import { count, desc, eq, sql, sum } from "drizzle-orm";
import { restaurantPhotos, restaurants } from "@forkd/db";
import { deleteOrphanFileInput, deleteStoragePhotoInput, logger } from "@forkd/shared";
import { adminProcedure, router } from "../trpc";

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
});
