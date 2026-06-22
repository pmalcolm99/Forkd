import { z } from "zod";
import { asc, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { restaurantStatusEnum, usStateEnum } from "@forkd/shared";
import { db, restaurants, restaurantReviews, cuisineTypes, user } from "@forkd/db";

// ---------------------------------------------------------------------------
// Transfer schema (version 1)
// ---------------------------------------------------------------------------

const transferReviewSchema = z.object({
  stars: z.number().int().min(1).max(5).nullable(),
  text: z.string().nullable(),
  reviewerName: z.string().nullable(),
  // Intentionally z.string() not z.string().email() — resilient to unusual emails
  reviewerEmail: z.string().nullable(),
  createdAt: z.string(),
});

const transferRestaurantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string(),
  // Optional + nullable so OLD exports (which always had a state) and worldwide
  // restaurants (no state) both import cleanly.
  state: usStateEnum.nullish(),
  // Added with worldwide support. Absent in pre-1.x exports → defaults to "US" on import.
  country: z.string().length(2).optional(),
  cuisineTypeName: z.string().nullable(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  status: restaurantStatusEnum,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  googlePlaceId: z.string().nullable(),
  googleRating: z.number().nullable(),
  socialUrl: z.string().nullable(),
  createdAt: z.string(),
  reviews: z.array(transferReviewSchema),
});

export const transferDocumentSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  appName: z.literal("Forkd"),
  restaurantCount: z.number().int().nonnegative(),
  restaurants: z.array(transferRestaurantSchema),
});

export type TransferDocument = z.infer<typeof transferDocumentSchema>;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function buildExportDocument(): Promise<TransferDocument> {
  const rows = await db.query.restaurants.findMany({
    where: isNull(restaurants.deletedAt),
    with: {
      cuisineType: true,
      reviews: {
        with: { user: { columns: { name: true, email: true } } },
      },
    },
    orderBy: [asc(restaurants.createdAt)],
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: "Forkd",
    restaurantCount: rows.length,
    restaurants: rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      state: r.state,
      country: r.country,
      cuisineTypeName: r.cuisineType?.name ?? null,
      description: r.description,
      website: r.website,
      status: r.status,
      // numeric() columns come back from pg as strings — parseFloat for JSON
      latitude: r.latitude != null ? parseFloat(r.latitude) : null,
      longitude: r.longitude != null ? parseFloat(r.longitude) : null,
      googlePlaceId: r.googlePlaceId,
      googleRating: r.googleRating != null ? parseFloat(r.googleRating) : null,
      socialUrl: r.socialUrl,
      createdAt: r.createdAt.toISOString(),
      reviews: r.reviews.map((rev) => ({
        stars: rev.stars,
        text: rev.text,
        reviewerName: rev.user.name,
        reviewerEmail: rev.user.email,
        createdAt: rev.createdAt.toISOString(),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// Derive transaction type from db so we don't depend on drizzle internals
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ImportSummary {
  restaurantsImported: number;
  restaurantsSkipped: number;
  skippedNames: string[];
  reviewsImported: number;
  reviewsSkipped: number;
  cuisineTypesCreated: number;
}

export async function importRestaurants(tx: Tx, doc: TransferDocument): Promise<ImportSummary> {
  // ── 1. Upsert cuisine types by name ────────────────────────────────────
  let cuisineTypesCreated = 0;
  const cuisineMap = new Map<string, string>(); // lowerName → local id

  const existingCuisines = await tx.select().from(cuisineTypes);
  for (const c of existingCuisines) cuisineMap.set(c.name.toLowerCase(), c.id);

  const neededCuisines = new Set<string>();
  for (const r of doc.restaurants) {
    if (r.cuisineTypeName && !cuisineMap.has(r.cuisineTypeName.toLowerCase()))
      neededCuisines.add(r.cuisineTypeName);
  }

  for (const name of neededCuisines) {
    const inserted = await tx
      .insert(cuisineTypes)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: cuisineTypes.id, name: cuisineTypes.name });

    if (inserted[0]) {
      cuisineMap.set(inserted[0].name.toLowerCase(), inserted[0].id);
      cuisineTypesCreated++;
    } else {
      // Another row with same name (different casing) already exists
      const rows = await tx
        .select({ id: cuisineTypes.id, name: cuisineTypes.name })
        .from(cuisineTypes)
        .where(sql`lower(${cuisineTypes.name}) = lower(${name})`)
        .limit(1);
      if (rows[0]) cuisineMap.set(rows[0].name.toLowerCase(), rows[0].id);
    }
  }

  // ── 2. Load existing restaurants for duplicate detection ───────────────
  const existingRows = await tx
    .select({
      googlePlaceId: restaurants.googlePlaceId,
      name: restaurants.name,
      address: restaurants.address,
    })
    .from(restaurants)
    .where(isNull(restaurants.deletedAt));

  const existingPlaceIds = new Set<string>();
  const existingNameAddr = new Set<string>();
  for (const r of existingRows) {
    if (r.googlePlaceId) existingPlaceIds.add(r.googlePlaceId);
    existingNameAddr.add(`${r.name.trim().toLowerCase()}|||${r.address.trim().toLowerCase()}`);
  }

  // ── 3. Load users by email for review attribution ───────────────────────
  const allUsers = await tx.select({ id: user.id, email: user.email }).from(user);
  const userEmailMap = new Map(allUsers.map((u) => [u.email.toLowerCase(), u.id]));

  // ── 4. Process each restaurant ─────────────────────────────────────────
  const summary: ImportSummary = {
    restaurantsImported: 0,
    restaurantsSkipped: 0,
    skippedNames: [],
    reviewsImported: 0,
    reviewsSkipped: 0,
    cuisineTypesCreated,
  };

  for (const r of doc.restaurants) {
    // Duplicate check — googlePlaceId first (strongest signal)
    if (r.googlePlaceId && existingPlaceIds.has(r.googlePlaceId)) {
      summary.restaurantsSkipped++;
      summary.skippedNames.push(r.name);
      continue;
    }

    // Duplicate check — normalized name + address
    const nameAddrKey = `${r.name.trim().toLowerCase()}|||${r.address.trim().toLowerCase()}`;
    if (existingNameAddr.has(nameAddrKey)) {
      summary.restaurantsSkipped++;
      summary.skippedNames.push(r.name);
      continue;
    }

    // Insert the restaurant with a fresh UUID
    const newId = randomUUID();
    const cuisineTypeId = r.cuisineTypeName
      ? (cuisineMap.get(r.cuisineTypeName.toLowerCase()) ?? null)
      : null;

    await tx.insert(restaurants).values({
      id: newId,
      name: r.name,
      address: r.address,
      state: r.state ?? null,
      country: r.country ?? "US",
      cuisineTypeId,
      description: r.description,
      website: r.website,
      status: r.status,
      // numeric() expects string on insert; JSON supplies numbers
      latitude: r.latitude != null ? String(r.latitude) : null,
      longitude: r.longitude != null ? String(r.longitude) : null,
      googlePlaceId: r.googlePlaceId,
      googleRating: r.googleRating != null ? String(r.googleRating) : null,
      socialUrl: r.socialUrl,
      addedByUserId: null, // original user doesn't exist on this instance
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(),
    });

    summary.restaurantsImported++;

    // Update in-memory sets so duplicates within the same file are caught
    if (r.googlePlaceId) existingPlaceIds.add(r.googlePlaceId);
    existingNameAddr.add(nameAddrKey);

    // Insert reviews for users that exist on this instance
    const insertedReviewKeys = new Set<string>(); // guard against dupes within same file
    for (const rev of r.reviews) {
      if (!rev.reviewerEmail) {
        summary.reviewsSkipped++;
        continue;
      }
      const userId = userEmailMap.get(rev.reviewerEmail.toLowerCase());
      if (!userId) {
        summary.reviewsSkipped++;
        continue;
      }
      const key = `${newId}|||${userId}`;
      if (insertedReviewKeys.has(key)) {
        summary.reviewsSkipped++;
        continue;
      }

      await tx.insert(restaurantReviews).values({
        restaurantId: newId,
        userId,
        stars: rev.stars,
        text: rev.text,
        createdAt: new Date(rev.createdAt),
        updatedAt: new Date(),
      });
      insertedReviewKeys.add(key);
      summary.reviewsImported++;
    }
  }

  return summary;
}
