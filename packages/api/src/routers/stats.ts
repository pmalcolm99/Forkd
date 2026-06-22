import {
  and,
  avg,
  count,
  countDistinct,
  inArray,
  isNotNull,
  isNull,
  or,
  eq,
  sum,
} from "drizzle-orm";
import {
  cuisineTypes,
  restaurantPhotos,
  restaurantReviews,
  restaurants,
  user as userTable,
} from "@forkd/db";
import { adminProcedure, router } from "../trpc";

const VISITED_STATUSES = ["been_loved", "been_okay", "been_disliked"] as const;

export const statsRouter = router({
  overview: adminProcedure.query(async ({ ctx }) => {
    const live = isNull(restaurants.deletedAt);

    const [
      restaurantAgg,
      wantToTryAgg,
      visitedAgg,
      withCoordsAgg,
      countriesAgg,
      reviewAgg,
      photoAgg,
      userAgg,
      adminAgg,
      cuisineAgg,
    ] = await Promise.all([
      ctx.db.select({ c: count() }).from(restaurants).where(live),
      ctx.db
        .select({ c: count() })
        .from(restaurants)
        .where(and(live, eq(restaurants.status, "want_to_try"))),
      ctx.db
        .select({ c: count() })
        .from(restaurants)
        .where(and(live, inArray(restaurants.status, [...VISITED_STATUSES]))),
      ctx.db
        .select({ c: count() })
        .from(restaurants)
        .where(and(live, isNotNull(restaurants.latitude))),
      ctx.db
        .select({ c: countDistinct(restaurants.country) })
        .from(restaurants)
        .where(live),
      ctx.db.select({ c: count(), avgStars: avg(restaurantReviews.stars) }).from(restaurantReviews),
      ctx.db.select({ c: count(), bytes: sum(restaurantPhotos.byteSize) }).from(restaurantPhotos),
      ctx.db.select({ c: count() }).from(userTable),
      ctx.db
        .select({ c: count() })
        .from(userTable)
        .where(or(eq(userTable.isAdmin, true), eq(userTable.isOwner, true))),
      ctx.db.select({ c: count() }).from(cuisineTypes),
    ]);

    return {
      restaurants: restaurantAgg[0]?.c ?? 0,
      wantToTry: wantToTryAgg[0]?.c ?? 0,
      visited: visitedAgg[0]?.c ?? 0,
      withCoordinates: withCoordsAgg[0]?.c ?? 0,
      countries: countriesAgg[0]?.c ?? 0,
      reviews: reviewAgg[0]?.c ?? 0,
      averageStars: reviewAgg[0]?.avgStars != null ? parseFloat(reviewAgg[0].avgStars) : null,
      photos: photoAgg[0]?.c ?? 0,
      photoBytes: Number(photoAgg[0]?.bytes ?? 0),
      users: userAgg[0]?.c ?? 0,
      admins: adminAgg[0]?.c ?? 0,
      cuisineTypes: cuisineAgg[0]?.c ?? 0,
    };
  }),
});
