import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { restaurantReviews, restaurants } from "@forkd/db";
import { deleteReviewInput, upsertReviewInput } from "@forkd/shared";
import { protectedProcedure, router } from "../trpc";

export const reviewsRouter = router({
  upsert: protectedProcedure.input(upsertReviewInput).mutation(async ({ input, ctx }) => {
    const restaurant = await ctx.db.query.restaurants.findFirst({
      where: and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)),
    });
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found" });

    const [row] = await ctx.db
      .insert(restaurantReviews)
      .values({
        restaurantId: input.restaurantId,
        userId: ctx.user.id,
        stars: input.stars ?? null,
        text: input.text ?? null,
      })
      .onConflictDoUpdate({
        target: [restaurantReviews.restaurantId, restaurantReviews.userId],
        set: {
          stars: input.stars ?? null,
          text: input.text ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }),

  delete: protectedProcedure.input(deleteReviewInput).mutation(async ({ input, ctx }) => {
    const row = await ctx.db.query.restaurantReviews.findFirst({
      where: eq(restaurantReviews.id, input.id),
    });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });

    const isAuthor = row.userId === ctx.user.id;
    const canDelete = isAuthor || ctx.user.isAdmin || ctx.user.isOwner;
    if (!canDelete) throw new TRPCError({ code: "FORBIDDEN" });

    await ctx.db.delete(restaurantReviews).where(eq(restaurantReviews.id, input.id));
    return { success: true };
  }),
});
