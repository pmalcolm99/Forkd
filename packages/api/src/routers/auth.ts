import { TRPCError } from "@trpc/server";
import { count, eq, sql } from "drizzle-orm";
import z from "zod";
import { auth, makeSignature } from "@forkd/auth";
import { user, session } from "@forkd/db";
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

const devSignInSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
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

  // devSignIn is completely absent in production builds
  ...(process.env.NODE_ENV !== "production"
    ? {
        devSignIn: publicProcedure.input(devSignInSchema).mutation(async ({ input, ctx }) => {
          // Defense-in-depth: reject explicitly in case of misconfiguration
          if (process.env.NODE_ENV === "production") {
            throw new TRPCError({ code: "NOT_FOUND" });
          }

          // Look up or create the user
          const [existing] = await ctx.db
            .select()
            .from(user)
            .where(eq(user.email, input.email))
            .limit(1);

          let userId: string;
          if (existing) {
            userId = existing.id;
            if (input.firstName !== undefined || input.lastName !== undefined) {
              const firstName = input.firstName ?? existing.firstName ?? "";
              const lastName = input.lastName ?? existing.lastName ?? "";
              await ctx.db
                .update(user)
                .set({
                  firstName,
                  lastName,
                  name: `${firstName} ${lastName}`.trim(),
                  updatedAt: new Date(),
                })
                .where(eq(user.id, userId));
            }
          } else {
            const { randomUUID } = await import("node:crypto");
            userId = randomUUID();
            const firstName = input.firstName ?? "";
            const lastName = input.lastName ?? "";
            await ctx.db.insert(user).values({
              id: userId,
              email: input.email,
              emailVerified: true,
              name: `${firstName} ${lastName}`.trim() || input.email,
              firstName,
              lastName,
              isAdmin: false,
              isOwner: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }

          // Better Auth does not expose a public API for creating a session
          // without password authentication. Instead we insert the session row
          // directly and construct the signed cookie value using the public
          // makeSignature function from better-auth/crypto (same signing
          // logic Better Auth uses internally in setSessionCookie).
          const { randomUUID } = await import("node:crypto");
          const rawToken = randomUUID();
          const signedToken = `${rawToken}.${await makeSignature(rawToken, process.env.MASTER_KEY!)}`;

          await ctx.db.insert(session).values({
            id: randomUUID(),
            token: rawToken,
            userId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
            // ipAddress and userAgent are nullable — omit
          });

          const { cookies } = await import("next/headers");
          const cookieStore = await cookies();
          // Cookie name: better-auth uses "${cookiePrefix}.session_token" which
          // resolves to "forkd.session_token" in dev (no __Secure- prefix when
          // AUTH_URL starts with http://)
          cookieStore.set("forkd.session_token", signedToken, {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 days — matches Better Auth default
            secure: false, // dev only
          });

          logger.info({ userId, email: input.email }, "Dev sign-in");
          return { success: true };
        }),
      }
    : {}),
});
