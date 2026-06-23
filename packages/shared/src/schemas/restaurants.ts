import { z } from "zod";
import { countryCodeEnum } from "../countries";

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

// Plain base object (no refinement) so updateRestaurantInput can call .partial().
const createRestaurantBase = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  // State is US-only and optional at the type level; the refine below requires it
  // when country is US so the state filter stays meaningful for US restaurants.
  state: usStateEnum.nullable().optional(),
  country: countryCodeEnum.default("US"),
  cuisineTypeId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  website: z.string().url().nullable().optional(),
  status: restaurantStatusEnum.default("want_to_try"),
  googlePlaceId: z.string().nullable().optional(),
  googleRating: z.number().min(0).max(5).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const createRestaurantInput = createRestaurantBase.superRefine((val, ctx) => {
  if (val.country === "US" && !val.state) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "State is required for US restaurants",
      path: ["state"],
    });
  }
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInput>;

export const updateRestaurantInput = z
  .object({ id: z.string().uuid() })
  .merge(createRestaurantBase.partial());
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantInput>;

export const listRestaurantsInput = z.object({
  status: z.array(restaurantStatusEnum).optional(),
  state: usStateEnum.optional(),
  country: countryCodeEnum.optional(),
  priceLevel: z.coerce.number().int().min(1).max(4).optional(),
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
  state: USStateCode | null;
  country: string;
  cuisineTypeId: string | null;
  description: string | null;
  website: string | null;
  status: RestaurantStatus;
}): CreateRestaurantInput {
  return {
    name: row.name,
    address: row.address,
    state: row.state,
    country: row.country,
    cuisineTypeId: row.cuisineTypeId ?? undefined,
    description: row.description ?? undefined,
    website: row.website ?? undefined,
    status: row.status,
  };
}
