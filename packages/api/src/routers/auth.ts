import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import z from "zod";
import { makeSignature } from "@forkd/auth";
import { user, session } from "@forkd/db";
import {
  defaultFiltersSchema,
  logger,
  mapDefaultViewEnum,
  themeEnum,
  usStateEnum,
} from "@forkd/shared";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name required").max(100).trim(),
  lastName: z.string().min(1, "Last name required").max(100).trim(),
  homeState: usStateEnum.nullable().optional(),
  theme: themeEnum.nullable().optional(),
  mapDefaultView: mapDefaultViewEnum.nullable().optional(),
  defaultFilters: defaultFiltersSchema.nullable().optional(),
  // Payment handles, shown on a bill's share page when this person paid.
  venmoHandle: z.string().max(60).trim().nullable().optional(),
  cashAppHandle: z.string().max(60).trim().nullable().optional(),
  paymentNote: z.string().max(300).trim().nullable().optional(),
});

// defaultFilters is stored as a JSON text column; parse it defensively for `me`.
function parseDefaultFilters(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = defaultFiltersSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => {
    const { id, email, firstName, lastName, isAdmin, isOwner, homeState, theme } = ctx.user;
    return {
      id,
      email,
      firstName,
      lastName,
      isAdmin,
      isOwner,
      homeState,
      theme,
      mapDefaultView: ctx.user.mapDefaultView ?? null,
      defaultFilters: parseDefaultFilters(ctx.user.defaultFilters),
      lastSeenChangelogVersion: ctx.user.lastSeenChangelogVersion ?? null,
      venmoHandle: ctx.user.venmoHandle ?? null,
      cashAppHandle: ctx.user.cashAppHandle ?? null,
      paymentNote: ctx.user.paymentNote ?? null,
    };
  }),

  updateProfile: protectedProcedure.input(updateProfileSchema).mutation(async ({ input, ctx }) => {
    const name = `${input.firstName} ${input.lastName}`;
    await ctx.db
      .update(user)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        name,
        homeState: input.homeState ?? null,
        // Only overwrite theme when provided, so non-theme profile saves keep it.
        ...(input.theme !== undefined ? { theme: input.theme ?? null } : {}),
        ...(input.mapDefaultView !== undefined
          ? { mapDefaultView: input.mapDefaultView ?? null }
          : {}),
        ...(input.defaultFilters !== undefined
          ? { defaultFilters: input.defaultFilters ? JSON.stringify(input.defaultFilters) : null }
          : {}),
        // Strip a leading @ / $ so the deep links build correctly whichever way
        // people type their handle.
        ...(input.venmoHandle !== undefined
          ? { venmoHandle: input.venmoHandle?.replace(/^@/, "") || null }
          : {}),
        ...(input.cashAppHandle !== undefined
          ? { cashAppHandle: input.cashAppHandle?.replace(/^\$/, "") || null }
          : {}),
        ...(input.paymentNote !== undefined ? { paymentNote: input.paymentNote || null } : {}),
      })
      .where(eq(user.id, ctx.user.id));
    return { success: true };
  }),

  // Stamp the user as having seen the current version's changelog (from the popup
  // dismiss, and from the welcome flow so new users start caught up).
  markChangelogSeen: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(user)
      .set({ lastSeenChangelogVersion: process.env.APP_VERSION ?? null })
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
