import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import z from "zod";
import { user } from "@forkd/db";
import { logger } from "@forkd/shared";
import { adminProcedure, ownerProcedure, protectedProcedure, router } from "../trpc";

export const usersRouter = router({
  // Existing: used by the restaurant list filter UI.
  listForFilter: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: user.id, firstName: user.firstName, lastName: user.lastName })
      .from(user)
      .orderBy(asc(user.firstName), asc(user.lastName))
  ),

  // Admin: full user list with role info for the admin UI.
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        firstName: user.firstName,
        isOwner: user.isOwner,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
      })
      .from(user)
      // isOwner first, then admins, then users — all alphabetical within each group.
      .orderBy(desc(user.isOwner), desc(user.isAdmin), asc(user.firstName))
  ),

  promoteToAdmin: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [target] = await ctx.db
        .select({ isOwner: user.isOwner, isAdmin: user.isAdmin })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.isOwner) return { ok: true }; // owner supersedes admin — no-op

      await ctx.db
        .update(user)
        .set({ isAdmin: true, updatedAt: new Date() })
        .where(eq(user.id, input.userId));

      logger.info(
        { event: "user_promoted_to_admin", actorId: ctx.user.id, targetUserId: input.userId },
        "User promoted to admin"
      );

      return { ok: true };
    }),

  revokeAdmin: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [target] = await ctx.db
        .select({ isOwner: user.isOwner })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot revoke admin from the owner account",
        });
      }

      await ctx.db
        .update(user)
        .set({ isAdmin: false, updatedAt: new Date() })
        .where(eq(user.id, input.userId));

      logger.info(
        { event: "user_admin_revoked", actorId: ctx.user.id, targetUserId: input.userId },
        "Admin revoked from user"
      );

      return { ok: true };
    }),

  remove: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove your own account" });
      }

      const [target] = await ctx.db
        .select({ isOwner: user.isOwner })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.isOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the owner account" });
      }

      await ctx.db.delete(user).where(eq(user.id, input.userId));

      logger.info(
        { event: "user_removed", actorId: ctx.user.id, targetUserId: input.userId },
        "User removed"
      );

      return { ok: true };
    }),
});
