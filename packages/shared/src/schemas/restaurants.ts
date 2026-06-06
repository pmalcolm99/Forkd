import { z } from "zod";

export const restaurantStatusEnum = z.enum([
  "want_to_try",
  "been_loved",
  "been_okay",
  "been_disliked",
  "permanently_closed",
]);
export type RestaurantStatus = z.infer<typeof restaurantStatusEnum>;

export const usStateEnum = z.enum([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);
export type USStateCode = z.infer<typeof usStateEnum>;

export const createRestaurantInput = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  state: usStateEnum,
  cuisineTypeId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  website: z.string().url().nullable().optional(),
  status: restaurantStatusEnum.default("want_to_try"),
  googlePlaceId: z.string().nullable().optional(),
  googleRating: z.number().min(0).max(5).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInput>;

export const updateRestaurantInput = z
  .object({ id: z.string().uuid() })
  .merge(createRestaurantInput.partial());
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantInput>;

export const listRestaurantsInput = z.object({
  status: z.array(restaurantStatusEnum).optional(),
  state: usStateEnum.optional(),
  cuisineTypeId: z.string().uuid().optional(),
  addedByUserId: z.string().optional(), // text, not uuid — matches users.id
  search: z.string().optional(),
  sort: z.enum(["recent", "alphabetical", "family_rating", "google_rating"]).default("recent"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(20),
});
export type ListRestaurantsInput = z.infer<typeof listRestaurantsInput>;

// Maps a restaurant DB row back to form input fields.
// Uses a structural type so packages/shared has no dependency on @forkd/db.
export function restaurantRowToInput(row: {
  name: string;
  address: string;
  state: USStateCode;
  cuisineTypeId: string | null;
  description: string | null;
  website: string | null;
  status: RestaurantStatus;
}): CreateRestaurantInput {
  return {
    name: row.name,
    address: row.address,
    state: row.state,
    cuisineTypeId: row.cuisineTypeId ?? undefined,
    description: row.description ?? undefined,
    website: row.website ?? undefined,
    status: row.status,
  };
}
