import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { eq } from "drizzle-orm";
import { auth } from "@forkd/auth";
import { db, user as userTable, getDecryptedConfigValue } from "@forkd/db";

// Maintenance mode (set during a restore) blocks non-owner requests. Cached briefly
// so the check doesn't add a DB round-trip to every authenticated request.
let maintenanceCache: { value: boolean; at: number } | null = null;
async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < 5000) return maintenanceCache.value;
  const raw = await getDecryptedConfigValue("maintenance_mode", db).catch(() => null);
  const on = raw === "true";
  maintenanceCache = { value: on, at: now };
  return on;
}

export const createTRPCContext = async ({
  req,
  fileStore,
  shutdownFn,
}: {
  req: Request;
  fileStore?: {
    deletePhotoFiles: (restaurantId: string, photoId: string) => Promise<void>;
    getStorageUsage?: () => Promise<{
      uploadsBytes: number;
      backupsBytes: number;
      diskTotalBytes: number;
      diskFreeBytes: number;
    }>;
    listAllUploadFiles?: () => Promise<{ relPath: string; byteSize: number; mtimeMs: number }[]>;
    deleteUploadFile?: (relPath: string) => Promise<void>;
    clearOrphanedVideos?: () => Promise<{ count: number; freedBytes: number }>;
  };
  shutdownFn?: (reason: string, actorId: string) => Promise<void>;
}) => {
  const session = await auth.api.getSession({ headers: req.headers });
  return {
    db,
    session: session?.session ?? null,
    user: session?.user ?? null,
    fileStore: fileStore ?? null,
    shutdownFn: shutdownFn ?? null,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // During a restore, only the owner may act; everyone else gets a clear message.
  if (!ctx.user.isOwner && (await isMaintenanceMode())) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Forkd is in maintenance mode (a restore is in progress). Please try again shortly.",
    });
  }
  // Fire-and-forget: update lastActiveAt at most once per 5 min per user.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!ctx.user.lastActiveAt || ctx.user.lastActiveAt < fiveMinAgo) {
    ctx.db
      .update(userTable)
      .set({ lastActiveAt: new Date() })
      .where(eq(userTable.id, ctx.user.id))
      .catch(() => {});
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isAdmin && !ctx.user.isOwner) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isOwner) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
