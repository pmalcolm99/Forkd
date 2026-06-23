import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import z from "zod";
import { restaurantPhotos, restaurantReviews, restaurants, setConfigValue } from "@forkd/db";
import {
  createRestaurantInput,
  listRestaurantsInput,
  updateRestaurantInput,
  logger,
  STATE_GEO_BOUNDS,
} from "@forkd/shared";
import { adminProcedure, protectedProcedure, router } from "../trpc";
import { suggestRestaurantMetadata } from "../ai/anthropic";
import { searchPlaces, getPlaceRating } from "../external/google-places";
import { fetchAndStoreGooglePhoto } from "../external/google-photo";
import { getDecryptedConfigValue } from "../config/read";
import type { db as DbType } from "@forkd/db";

// ── Bulk "refresh all metadata" backfill ──────────────────────────────────────
// Runs as a detached background loop in the long-lived server (not awaited by the
// request, so it can't time out). Progress is stored in app_config and polled by
// the admin UI. Only restaurants linked to Google Places are refreshed.

const REFRESH_STATUS_KEY = "metadata_refresh.status";
const REFRESH_STALE_MS = 30 * 60 * 1000;

interface RefreshStatus {
  running: boolean;
  total: number;
  done: number;
  updated: number;
  failed: number;
  startedAt: string | null;
  finishedAt: string | null;
}

const IDLE_STATUS: RefreshStatus = {
  running: false,
  total: 0,
  done: 0,
  updated: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
};

function parseRefreshStatus(raw: string | null): RefreshStatus {
  if (!raw) return IDLE_STATUS;
  try {
    return { ...IDLE_STATUS, ...(JSON.parse(raw) as Partial<RefreshStatus>) };
  } catch {
    return IDLE_STATUS;
  }
}

async function writeRefreshStatus(db: typeof DbType, status: RefreshStatus): Promise<void> {
  await setConfigValue(db, REFRESH_STATUS_KEY, JSON.stringify(status)).catch(() => {});
}

async function runBulkMetadataRefresh(db: typeof DbType, startedAt: string): Promise<void> {
  let total = 0;
  let done = 0;
  let updated = 0;
  let failed = 0;
  const tick = (running: boolean): RefreshStatus => ({
    running,
    total,
    done,
    updated,
    failed,
    startedAt,
    finishedAt: running ? null : new Date().toISOString(),
  });

  try {
    const apiKey = await getDecryptedConfigValue("google_places.api_key", db);
    if (!apiKey) {
      await writeRefreshStatus(db, tick(false));
      return;
    }

    const rows = await db
      .select({ id: restaurants.id, googlePlaceId: restaurants.googlePlaceId })
      .from(restaurants)
      .where(and(isNull(restaurants.deletedAt), isNotNull(restaurants.googlePlaceId)));
    total = rows.length;
    await writeRefreshStatus(db, tick(true));

    for (const r of rows) {
      try {
        const result = await getPlaceRating(r.googlePlaceId!, db);
        if (result.status === "success") {
          await db
            .update(restaurants)
            .set({
              googleRating: result.rating !== null ? String(result.rating) : null,
              googleRatingsTotal: result.ratingsTotal,
              googleRatingFetchedAt: new Date(),
              googlePriceLevel: result.priceLevel,
              googleOpeningHours: result.openingHours,
              ...(result.latitude !== null && result.longitude !== null
                ? { latitude: String(result.latitude), longitude: String(result.longitude) }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, r.id));
          if (result.photoNames.length > 0) {
            await fetchGooglePhotosIfNeeded(result.photoNames, apiKey, r.id, db);
          }
          updated += 1;
        }
      } catch (err) {
        failed += 1;
        logger.warn({ err, restaurantId: r.id }, "Bulk metadata refresh failed for restaurant");
      }
      done += 1;
      await writeRefreshStatus(db, tick(true));
      // Gentle pacing to stay friendly to the Google Places quota.
      await new Promise((res) => setTimeout(res, 150));
    }

    await writeRefreshStatus(db, tick(false));
    logger.info({ total, updated, failed }, "Bulk metadata refresh complete");
  } catch (err) {
    logger.error({ err }, "Bulk metadata refresh crashed");
    await writeRefreshStatus(db, tick(false));
  }
}

// Fetch up to 5 Google Places photos for a restaurant, skipping if photos already exist.
async function fetchGooglePhotosIfNeeded(
  photoNames: string[],
  apiKey: string,
  restaurantId: string,
  db: typeof DbType
) {
  if (photoNames.length === 0) return;
  const [existing] = await db
    .select({ c: count() })
    .from(restaurantPhotos)
    .where(eq(restaurantPhotos.restaurantId, restaurantId));
  if ((existing?.c ?? 0) > 0) return;
  await Promise.allSettled(
    photoNames.map((name) =>
      fetchAndStoreGooglePhoto(name, apiKey, restaurantId, db).catch((err) =>
        logger.warn({ err, restaurantId }, "Google Places photo fetch failed — skipping")
      )
    )
  );
}

export const restaurantsRouter = router({
  list: protectedProcedure.input(listRestaurantsInput).query(async ({ input, ctx }) => {
    const filters = [isNull(restaurants.deletedAt)];
    if (input.status?.length) filters.push(inArray(restaurants.status, input.status));
    if (input.state) filters.push(eq(restaurants.state, input.state));
    if (input.country) filters.push(eq(restaurants.country, input.country));
    if (input.priceLevel) filters.push(eq(restaurants.googlePriceLevel, input.priceLevel));
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

    // Fetch cover photos: use explicit coverPhotoId when set, else most-recent.
    const coverMap = new Map<string, { id: string; thumbPath: string }>();
    if (items.length > 0) {
      // 1. Restaurants with an explicit cover photo set.
      const withExplicit = items.filter((i) => i.coverPhotoId != null);
      if (withExplicit.length > 0) {
        const explicit = await ctx.db
          .select({
            id: restaurantPhotos.id,
            restaurantId: restaurantPhotos.restaurantId,
            thumbPath: restaurantPhotos.thumbPath,
          })
          .from(restaurantPhotos)
          .where(
            inArray(
              restaurantPhotos.id,
              withExplicit.map((i) => i.coverPhotoId as string)
            )
          );
        for (const p of explicit)
          coverMap.set(p.restaurantId, { id: p.id, thumbPath: p.thumbPath });
      }

      // 2. Fallback: most-recent photo for restaurants not yet in the map.
      const needFallback = items.filter((i) => !coverMap.has(i.id)).map((i) => i.id);
      if (needFallback.length > 0) {
        const covers = await ctx.db
          .selectDistinctOn([restaurantPhotos.restaurantId], {
            restaurantId: restaurantPhotos.restaurantId,
            id: restaurantPhotos.id,
            thumbPath: restaurantPhotos.thumbPath,
          })
          .from(restaurantPhotos)
          .where(inArray(restaurantPhotos.restaurantId, needFallback))
          .orderBy(asc(restaurantPhotos.restaurantId), desc(restaurantPhotos.createdAt));
        for (const c of covers) coverMap.set(c.restaurantId, { id: c.id, thumbPath: c.thumbPath });
      }
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
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Best-effort: store ratingsTotal and fetch up to 5 Google Places photos.
    if (row.googlePlaceId) {
      const apiKey = await getDecryptedConfigValue("google_places.api_key", ctx.db);
      if (apiKey) {
        const details = await getPlaceRating(row.googlePlaceId, ctx.db);
        if (details.status === "success") {
          await ctx.db
            .update(restaurants)
            .set({
              googleRatingsTotal: details.ratingsTotal,
              googlePriceLevel: details.priceLevel,
              googleOpeningHours: details.openingHours,
            })
            .where(eq(restaurants.id, row.id));
          await fetchGooglePhotosIfNeeded(details.photoNames, apiKey, row.id, ctx.db);
        }
      }
    }

    return row;
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
    .query(async ({ input, ctx }) => {
      const bounds = ctx.user.homeState ? STATE_GEO_BOUNDS[ctx.user.homeState] : undefined;
      return searchPlaces(input.query, ctx.db, bounds);
    }),

  refreshGoogleRating: protectedProcedure
    .input(z.object({ restaurantId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const row = await ctx.db.query.restaurants.findFirst({
        where: and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      // Step 1: if no place_id stored, find it via text search first.
      if (!row.googlePlaceId) {
        const query = [row.name, row.address ?? row.state].filter(Boolean).join(", ");
        const search = await searchPlaces(query, ctx.db);
        if (search.status === "not_configured") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Google Places API key not configured",
          });
        }
        if (search.status === "failed") {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: search.error });
        }
        const top = search.results[0];
        if (!top) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No Google Places result found for this restaurant",
          });
        }
        await ctx.db
          .update(restaurants)
          .set({
            googlePlaceId: top.placeId,
            googleRating: top.rating !== null ? String(top.rating) : null,
            googleRatingsTotal: top.ratingsTotal,
            googleRatingFetchedAt: new Date(),
            googlePriceLevel: top.priceLevel,
            googleOpeningHours: top.openingHours,
            latitude: String(top.latitude),
            longitude: String(top.longitude),
            updatedAt: new Date(),
          })
          .where(eq(restaurants.id, input.restaurantId));

        // Fetch up to 5 Google photos if none stored yet.
        if (top.photoNames.length > 0) {
          const apiKey = await getDecryptedConfigValue("google_places.api_key", ctx.db);
          if (apiKey) {
            await fetchGooglePhotosIfNeeded(top.photoNames, apiKey, input.restaurantId, ctx.db);
          }
        }

        return { ok: true };
      }

      // Step 2: place_id already known — refresh rating + coordinates from Place Details.
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
          googleRatingsTotal: result.ratingsTotal,
          googleRatingFetchedAt: new Date(),
          googlePriceLevel: result.priceLevel,
          googleOpeningHours: result.openingHours,
          ...(result.latitude !== null && result.longitude !== null
            ? { latitude: String(result.latitude), longitude: String(result.longitude) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, input.restaurantId));

      // Fetch up to 5 Google photos if none stored yet.
      if (result.photoNames.length > 0) {
        const apiKey = await getDecryptedConfigValue("google_places.api_key", ctx.db);
        if (apiKey) {
          await fetchGooglePhotosIfNeeded(result.photoNames, apiKey, input.restaurantId, ctx.db);
        }
      }

      return { ok: true };
    }),

  setCoverPhoto: protectedProcedure
    .input(z.object({ restaurantId: z.string().uuid(), photoId: z.string().uuid().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const row = await ctx.db.query.restaurants.findFirst({
        where: and(eq(restaurants.id, input.restaurantId), isNull(restaurants.deletedAt)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.photoId) {
        const photo = await ctx.db.query.restaurantPhotos.findFirst({
          where: and(
            eq(restaurantPhotos.id, input.photoId),
            eq(restaurantPhotos.restaurantId, input.restaurantId)
          ),
        });
        if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
      }

      await ctx.db
        .update(restaurants)
        .set({ coverPhotoId: input.photoId, updatedAt: new Date() })
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

  // Kick off a background refresh of Google metadata for every linked restaurant.
  refreshAllMetadata: adminProcedure.mutation(async ({ ctx }) => {
    const current = parseRefreshStatus(await getDecryptedConfigValue(REFRESH_STATUS_KEY, ctx.db));
    if (
      current.running &&
      current.startedAt &&
      Date.now() - Date.parse(current.startedAt) < REFRESH_STALE_MS
    ) {
      return { started: false as const, alreadyRunning: true as const };
    }

    const startedAt = new Date().toISOString();
    // Write the running state synchronously so the UI sees it on the next poll.
    await writeRefreshStatus(ctx.db, { ...IDLE_STATUS, running: true, startedAt });
    void runBulkMetadataRefresh(ctx.db, startedAt);
    return { started: true as const, alreadyRunning: false as const };
  }),

  refreshAllMetadataStatus: adminProcedure.query(async ({ ctx }) => {
    return parseRefreshStatus(await getDecryptedConfigValue(REFRESH_STATUS_KEY, ctx.db));
  }),
});
