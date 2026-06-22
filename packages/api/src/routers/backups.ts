import { TRPCError } from "@trpc/server";
import { desc, eq, isNull } from "drizzle-orm";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { backups, user as userTable, setConfigValue } from "@forkd/db";
import { backupQueue, reconcileScheduledBackup } from "@forkd/queue";
import { logger } from "@forkd/shared";
import { ownerProcedure, router } from "../trpc";
import { getDecryptedConfigValue } from "../config/read";

const FILENAME_RE = /^forkd-backup-[\w.:-]+\.tar\.gz$/;

function backupsDir(): string {
  return process.env.BACKUPS_DIR ?? "/app/backups";
}

function resolveBackupPath(filename: string): string {
  if (!FILENAME_RE.test(filename)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid backup filename" });
  }
  return path.join(backupsDir(), filename);
}

export const backupsRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: backups.id,
        filename: backups.filename,
        byteSize: backups.byteSize,
        trigger: backups.trigger,
        createdAt: backups.createdAt,
        triggeredByFirst: userTable.firstName,
        triggeredByLast: userTable.lastName,
      })
      .from(backups)
      .leftJoin(userTable, eq(backups.triggeredByUserId, userTable.id))
      .where(isNull(backups.deletedAt))
      .orderBy(desc(backups.createdAt));

    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      byteSize: Number(r.byteSize),
      trigger: r.trigger,
      createdAt: r.createdAt,
      triggeredBy: [r.triggeredByFirst, r.triggeredByLast].filter(Boolean).join(" ") || "Scheduled",
    }));
  }),

  create: ownerProcedure.mutation(async ({ ctx }) => {
    const job = await backupQueue.add("backup", {
      type: "backup",
      trigger: "manual",
      userId: ctx.user.id,
    });
    return { jobId: String(job.id) };
  }),

  // Poll a backup/restore job for the UI.
  jobStatus: ownerProcedure.input(z.object({ jobId: z.string() })).query(async ({ input }) => {
    const job = await backupQueue.getJob(input.jobId);
    if (!job) return { state: "unknown" as const, failedReason: null };
    const state = await job.getState();
    return { state, failedReason: job.failedReason ?? null };
  }),

  remove: ownerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const row = await ctx.db.query.backups.findFirst({ where: eq(backups.id, input.id) });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      await unlink(resolveBackupPath(row.filename)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
      await ctx.db.update(backups).set({ deletedAt: new Date() }).where(eq(backups.id, input.id));
      return { success: true };
    }),

  // Restore from an existing backup in the list.
  restore: ownerProcedure.input(z.object({ filename: z.string() })).mutation(async ({ input }) => {
    const archivePath = resolveBackupPath(input.filename);
    if (!existsSync(archivePath)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Backup file not found on disk" });
    }
    const job = await backupQueue.add("restore", { type: "restore", archivePath });
    logger.warn({ filename: input.filename }, "Restore enqueued");
    return { jobId: String(job.id) };
  }),

  getSchedule: ownerProcedure.query(async ({ ctx }) => {
    const cron = (await getDecryptedConfigValue("backup.schedule_cron", ctx.db)) ?? "";
    const retention = (await getDecryptedConfigValue("backup.retention_count", ctx.db)) ?? "30";
    return { cron, retentionCount: Number(retention) || 30 };
  }),

  setSchedule: ownerProcedure
    .input(
      z.object({
        // Empty disables scheduling. Otherwise a standard 5-field cron expression.
        cron: z
          .string()
          .trim()
          .refine(
            (v) => v === "" || v.split(/\s+/).length === 5,
            "Must be a 5-field cron expression"
          ),
        retentionCount: z.number().int().min(1).max(365),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await setConfigValue(ctx.db, "backup.schedule_cron", input.cron);
      await setConfigValue(ctx.db, "backup.retention_count", String(input.retentionCount));
      await reconcileScheduledBackup(input.cron);
      return { success: true };
    }),
});
