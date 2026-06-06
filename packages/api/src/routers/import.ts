import { TRPCError } from "@trpc/server";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { importJobs } from "@forkd/db";
import { importQueue } from "@forkd/queue";
import { protectedProcedure, router } from "../trpc";

const ALLOWED_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
]);

function isAllowedHost(raw: string): boolean {
  try {
    return ALLOWED_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export const importRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        url: z.string().url().refine(isAllowedHost, {
          message: "URL must be from a supported platform (TikTok, YouTube, or Facebook)",
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [row] = await ctx.db
        .select({ total: count() })
        .from(importJobs)
        .where(and(eq(importJobs.userId, ctx.user.id), gte(importJobs.createdAt, oneHourAgo)));

      if ((row?.total ?? 0) >= 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit: max 5 imports per hour",
        });
      }

      const [job] = await ctx.db
        .insert(importJobs)
        .values({ userId: ctx.user.id, sourceUrl: input.url, status: "queued" })
        .returning({ id: importJobs.id });

      if (!job)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create import job",
        });

      await importQueue.add("import", {
        jobId: job.id,
        sourceUrl: input.url,
        userId: ctx.user.id,
      });

      return { jobId: job.id };
    }),

  status: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.db
        .select({
          status: importJobs.status,
          step: importJobs.step,
          errorMessage: importJobs.errorMessage,
          restaurantId: importJobs.restaurantId,
        })
        .from(importJobs)
        .where(and(eq(importJobs.id, input.jobId), eq(importJobs.userId, ctx.user.id)))
        .limit(1);

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Import job not found" });
      }

      return job;
    }),
});
