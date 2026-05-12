import { TRPCError } from "@trpc/server";
import { count, eq, sql } from "drizzle-orm";
import z from "zod";
import { auth } from "@forkd/auth";
import { user } from "@forkd/db";
import { logger } from "@forkd/shared";
import { protectedProcedure, publicProcedure, router } from "../trpc";

export const bootstrapInputSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .refine((p) => /[a-z]/.test(p), "Must contain a lowercase letter")
    .refine((p) => /[A-Z]/.test(p), "Must contain an uppercase letter")
    .refine((p) => /[0-9]/.test(p), "Must contain a number")
    .refine((p) => /[^a-zA-Z0-9]/.test(p), "Must contain a special character"),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name required").max(100).trim(),
  lastName: z.string().min(1, "Last name required").max(100).trim(),
});

function setCookiesFromHeaders(
  cookieStore: Awaited<ReturnType<(typeof import("next/headers"))["cookies"]>>,
  headers: Headers
): void {
  for (const rawCookie of headers.getSetCookie()) {
    const segments = rawCookie.split(/;\s*/);
    const [nameValue, ...attrs] = segments;
    if (!nameValue) continue;
    const eqPos = nameValue.indexOf("=");
    if (eqPos === -1) continue;

    const cookieName = nameValue.slice(0, eqPos);
    const cookieValue = nameValue.slice(eqPos + 1);

    const options: Parameters<typeof cookieStore.set>[2] = {};
    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower === "httponly") {
        options.httpOnly = true;
      } else if (lower === "secure") {
        options.secure = true;
      } else if (lower.startsWith("samesite=")) {
        const v = attr.split("=")[1]?.toLowerCase();
        if (v === "strict" || v === "lax" || v === "none") {
          options.sameSite = v;
        }
      } else if (lower.startsWith("max-age=")) {
        const v = parseInt(attr.split("=")[1] ?? "");
        if (!isNaN(v)) options.maxAge = v;
      } else if (lower.startsWith("path=")) {
        options.path = attr.split("=")[1] ?? "/";
      } else if (lower.startsWith("domain=")) {
        options.domain = attr.split("=")[1];
      }
    }

    cookieStore.set(cookieName, cookieValue, options);
  }
}

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

  completeBootstrap: publicProcedure
    .input(bootstrapInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Fast pre-check before acquiring the lock
      const [preCheck] = await ctx.db.select({ count: count() }).from(user);
      if ((preCheck?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bootstrap already completed",
        });
      }

      // Acquire a transaction-level advisory lock to serialize concurrent
      // bootstrap attempts. The lock is released when the transaction commits.
      await ctx.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(7483264)`);
        const [check] = await tx.select({ count: count() }).from(user);
        if ((check?.count ?? 0) > 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Bootstrap already completed",
          });
        }
      });

      const name = `${input.firstName} ${input.lastName}`;

      // Create the user via Better Auth (uses a pool connection, not the
      // transaction above; the advisory lock above prevents concurrent attempts
      // from both reaching this point with count = 0)
      const signUpResult = await auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name },
        returnHeaders: true,
      });

      const newUserId = signUpResult.response.user.id;

      // Mark this user as the system owner and admin
      await ctx.db
        .update(user)
        .set({ isOwner: true, isAdmin: true, firstName: input.firstName, lastName: input.lastName })
        .where(eq(user.id, newUserId));

      // Forward the session cookie that Better Auth set so the browser is
      // signed in immediately after bootstrap completes
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      setCookiesFromHeaders(cookieStore, signUpResult.headers);

      logger.info({ userId: newUserId, email: input.email }, "Bootstrap owner created");

      return { success: true };
    }),
});
