import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import z from "zod";
import { makeSignature } from "@forkd/auth";
import { user, session } from "@forkd/db";
import { logger } from "@forkd/shared";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name required").max(100).trim(),
  lastName: z.string().min(1, "Last name required").max(100).trim(),
});

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => {
    const { id, email, firstName, lastName, isAdmin, isOwner } = ctx.user;
    return { id, email, firstName, lastName, isAdmin, isOwner };
  }),

  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(async ({ input, ctx }) => {
    const name = `${input.firstName} ${input.lastName}`;
    await ctx.db
      .update(user)
      .set({ firstName: input.firstName, lastName: input.lastName, name })
      .where(eq(user.id, ctx.user.id));
    return { success: true };
  }),

  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    // ctx.session.token is the raw (unsigned) token stored in the DB session.token column.
    // The signed cookie value is "rawToken.signature" — only rawToken lives in the DB.
    await ctx.db.delete(session).where(eq(session.token, ctx.session!.token));
    return { success: true };
  }),

  // devSelectUser and devCreateUser are completely absent in production builds.
  ...(process.env.NODE_ENV !== "production"
    ? {
        devSelectUser: publicProcedure
          .input(z.object({ userId: z.string().uuid() }))
          .mutation(async ({ input, ctx }) => {
            if (process.env.NODE_ENV === "production") throw new TRPCError({ code: "NOT_FOUND" });

            const [existing] = await ctx.db
              .select()
              .from(user)
              .where(eq(user.id, input.userId))
              .limit(1);
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

            const rawToken = randomUUID();
            const signedToken = `${rawToken}.${await makeSignature(rawToken, process.env.MASTER_KEY!)}`;

            await ctx.db.insert(session).values({
              id: randomUUID(),
              token: rawToken,
              userId: existing.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            (await cookies()).set("forkd.session_token", signedToken, {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 60 * 24 * 7,
              secure: false,
            });

            logger.info({ userId: existing.id }, "Dev select-user sign-in");
            return { success: true };
          }),

        devCreateUser: publicProcedure
          .input(
            z.object({
              email: z.string().email(),
              firstName: z.string().min(1).max(100).optional(),
              lastName: z.string().min(1).max(100).optional(),
            })
          )
          .mutation(async ({ input, ctx }) => {
            if (process.env.NODE_ENV === "production") throw new TRPCError({ code: "NOT_FOUND" });

            const [ownerRow] = await ctx.db
              .select({ c: count() })
              .from(user)
              .where(eq(user.isOwner, true));
            const isFirst = (ownerRow?.c ?? 0) === 0;

            const firstName = input.firstName ?? "";
            const lastName = input.lastName ?? "";
            const userId = randomUUID();

            await ctx.db.insert(user).values({
              id: userId,
              email: input.email,
              emailVerified: true,
              name: `${firstName} ${lastName}`.trim() || input.email,
              firstName: firstName || null,
              lastName: lastName || null,
              isAdmin: isFirst,
              isOwner: isFirst,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            const rawToken = randomUUID();
            const signedToken = `${rawToken}.${await makeSignature(rawToken, process.env.MASTER_KEY!)}`;

            await ctx.db.insert(session).values({
              id: randomUUID(),
              token: rawToken,
              userId,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            (await cookies()).set("forkd.session_token", signedToken, {
              httpOnly: true,
              sameSite: "lax",
              path: "/",
              maxAge: 60 * 60 * 24 * 7,
              secure: false,
            });

            logger.info({ userId, email: input.email }, "Dev create-user sign-in");
            return { success: true };
          }),
      }
    : {}),
});
