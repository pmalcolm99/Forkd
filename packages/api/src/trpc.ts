import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@forkd/auth";
import { db } from "@forkd/db";

export const createTRPCContext = async ({
  req,
  fileStore,
}: {
  req: Request;
  fileStore?: { deletePhotoFiles: (restaurantId: string, photoId: string) => Promise<void> };
}) => {
  const session = await auth.api.getSession({ headers: req.headers });
  return {
    db,
    session: session?.session ?? null,
    user: session?.user ?? null,
    fileStore: fileStore ?? null,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
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
