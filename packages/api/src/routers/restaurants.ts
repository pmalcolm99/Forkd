import { TRPCError } from "@trpc/server";
import { and, asc, avg, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import z from "zod";
import { restaurantPhotos, restaurantReviews, restaurants } from "@forkd/db";
import { createRestaurantInput, listRestaurantsInput, updateRestaurantInput } from "@forkd/shared";
import { protectedProcedure, router } from "../trpc";
import { suggestRestaurantMetadata } from "../ai/anthropic";
import { searchPlaces, getPlaceRating } from "../external/google-places";
import { getDecryptedConfigValue } from "../config/read";

export const restaurantsRouter = router({
  list: protectedProcedure.input(listRestaurantsInput).query(async ({ input, ctx }) => {
    const filters = [isNull(restaurants.deletedAt)];
    if (input.status?.length) filters.push(inArray(restaurants.status, input.status));
    if (input.state) filters.push(eq(restaurants.state, input.state));
    if (input.cuisineTypeId) filters.push(eq(restaurants.cuisineTypeId, input.cuisineTypeId));
    if (input.addedByUserId) filters.push(eq(restaurants.addedByUserId, input.addedByUserId));
    if (input.search) {
      filters.push(
        or(
          ilike(restaurants.name, `%${input.search}%`),
          ilike(restaurants.address, `%${input.search}%`)
        )!
      );
    }

    const where = and(...filters);
    const orderBy =
      input.sort === "alphabetical"
        ? asc(restaurants.name)
        : input.sort === "family_rating"
          ? sql`(SELECT AVG(${restaurantReviews.stars}) FROM ${restaurantReviews} WHERE ${restaurantReviews.restaurantId} = ${restaurants.id}) DESC NULLS LAST`
          : desc(restaurants.createdAt);
    const offset = (input.page - 1) * input.pageSize;

    const [items, totalResult] = await Promise.all([
      ctx.db.query.restaurants.findMany({
        where,
        orderBy,
        limit: input.pageSize,
        offset,
        with: {
          cuisineType: true,
          addedBy: { columns: { id: true, firstName: true, lastName: true } },
        },
      }),
      ctx.db.select({ total: count() }).from(restaurants).where(where),
    ]);

    // Fetch aggregate review stats for this page of restaurants in one query.
    // avg() with pg driver returns string | null; parseFloat preserves full precision
    // (rounding to display is handled by formatFamilyAverage in @forkd/shared).
    let statsMap = new Map<string, { avgStars: string | null; reviewCount: number }>();
    if (items.length > 0) {
      const stats = await ctx.db
        .select({
          restaurantId: restaurantReviews.restaurantId,
          avgStars: avg(restaurantReviews.stars),
          reviewCount: count(),
        })
        .from(restaurantReviews)
        .where(
          inArray(
            restaurantReviews.restaurantId,
            items.map((i) => i.id)
          )
        )
        .groupBy(restaurantReviews.restaurantId);
      statsMap = new Map(stats.map((s) => [s.restaurantId, s]));
    }

    // Fetch the most-recent cover photo per restaurant for this page.
    let coverMap = new Map<string, { id: string; thumbPath: string }>();
    if (items.length > 0) {
      const covers = await ctx.db
        .selectDistinctOn([restaurantPhotos.restaurantId], {
          restaurantId: restaurantPhotos.restaurantId,
          id: restaurantPhotos.id,
          thumbPath: restaurantPhotos.thumbPath,
        })
        .from(restaurantPhotos)
        .where(
          inArray(
            restaurantPhotos.restaurantId,
            items.map((i) => i.id)
          )
        )
        .orderBy(asc(restaurantPhotos.restaurantId), desc(restaurantPhotos.createdAt));
      coverMap = new Map(covers.map((c) => [c.restaurantId, { id: c.id, thumbPath: c.thumbPath }]));
    }

    const enrichedItems = items.map((item) => {
      const s = statsMap.get(item.id);
      return {
        ...item,
        familyAverage: s?.avgStars != null ? parseFloat(s.avgStars) : null,
        reviewCount: s?.reviewCount ?? 0,
        coverPhoto: coverMap.get(item.id) ?? null,
      };
    });

    return {
      items: enrichedItems,
      total: totalResult[0]?.total ?? 0,
      page: input.page,
      pageSize: input.pageSize,
    };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const row = await ctx.db.query.restaurants.findFirst({
        where: and(eq(restaurants.id, input.id), isNull(restaurants.deletedAt)),
        with: {
          cuisineType: true,
          addedBy: { columns: { id: true, firstName: true, lastName: true } },
          reviews: {
            with: { user: { columns: { id: true, firstName: true, lastName: true } } },
            orderBy: [desc(restaurantReviews.updatedAt), desc(restaurantReviews.createdAt)],
          },
          photos: {
            with: { uploadedBy: { columns: { id: true, firstName: true, lastName: true } } },
            orderBy: [desc(restaurantPhotos.createdAt)],
          },
        },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      // Compute aggregate from fetched reviews (no rounding — formatFamilyAverage handles display).
      const nonNullStars = row.reviews.filter((r) => r.stars != null).map((r) => r.stars as number);
      const familyAverage =
        nonNullStars.length > 0
          ? nonNullStars.reduce((a, b) => a + b, 0) / nonNullStars.length
          : null;

      return { ...row, familyAverage, reviewCount: row.reviews.length };
    }),

  create: protectedProcedure.input(createRestaurantInput).mutation(async ({ input, ctx }) => {
    const { latitude, longitude, googleRating, ...rest } = input;
    const [row] = await ctx.db
      .insert(restaurants)
      .values({
        ...rest,
        addedByUserId: ctx.user.id,
        latitude: latitude != null ? String(latitude) : null,
        longitude: longitude != null ? String(longitude) : null,
        googleRating: googleRating != null ? String(googleRating) : null,
        googleRatingFetchedAt: googleRating != null ? new Date() : undefined,
      })
      .returning();
    return row!;
  }),

  update: protectedProcedure.input(updateRestaurantInput).mutation(async ({ input, ctx }) => {
    const { id, latitude, longitude, googleRating, ...rest } = input;
    const existing = await ctx.db.query.restaurants.findFirst({
      where: and(eq(restaurants.id, id), isNull(restaurants.deletedAt)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await ctx.db
      .update(restaurants)
      .set({
        ...rest,
        latitude: latitude !== undefined ? (latitude != null ? String(latitude) : null) : undefined,
        longitude:
          longitude !== undefined ? (longitude != null ? String(longitude) : null) : undefined,
        googleRating:
          googleRating !== undefined
            ? googleRating != null
              ? String(googleRating)
              : null
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, id))
      .returning();
    return updated!;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch WITHOUT deletedAt filter to distinguish "missing" from "already deleted"
      const row = await ctx.db.query.restaurants.findFirst({
        where: eq(restaurants.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.deletedAt !== null) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdder = row.addedByUserId === ctx.user.id;
      const canDelete = isAdder || ctx.user.isAdmin || ctx.user.isOwner;
      if (!canDelete) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(restaurants)
        .set({ deletedAt: new Date() })
        .where(eq(restaurants.id, input.id));
      return { success: true };
    }),

  claudeConfigured: protectedProcedure.query(async ({ ctx }) => {
    const key = await getDecryptedConfigValue("ai.claude.api_key", ctx.db);
    return { configured: !!key };
  }),

  googlePlacesConfigured: protectedProcedure.query(async ({ ctx }) => {
    const key = await getDecryptedConfigValue("google_places.api_key", ctx.db);
    return { configured: !!key };
  }),

  searchGooglePlaces: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ input, ctx }) => searchPlaces(input.query, ctx.db)),

  refreshGoogleRating: protectedProcedure
    .input(z.object({ restaurantId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const row = await ctx.db.query.restaurants.findFirst({
        where: and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (!row.googlePlaceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No Google Place ID stored for this restaurant",
        });
      }
      const result = await getPlaceRating(row.googlePlaceId, ctx.db);
      if (result.status === "not_configured") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google Places API key not configured",
        });
      }
      if (result.status === "failed") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      }
      await ctx.db
        .update(restaurants)
        .set({
          googleRating: result.rating !== null ? String(result.rating) : null,
          googleRatingFetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, input.restaurantId));
      return { ok: true };
    }),

  suggestMetadata: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        address: z.string().max(500).nullish(),
        website: z.string().url().nullish(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return suggestRestaurantMetadata(input, ctx.db);
    }),
});
