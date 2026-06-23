import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { cuisineTypes } from "./cuisines";

export const restaurantStatusEnum = pgEnum("restaurant_status", [
  "want_to_try",
  "been_loved",
  "been_okay",
  "been_disliked",
  "permanently_closed",
]);

export const usStateEnum = pgEnum("us_state", [
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

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    // Nullable since worldwide support — state only applies to US restaurants.
    state: usStateEnum("state"),
    // ISO 3166-1 alpha-2 country code. Defaults to US so existing rows backfill
    // cleanly on migration (the app was US-only before this column existed).
    country: text("country").notNull().default("US"),
    cuisineTypeId: uuid("cuisine_type_id").references(() => cuisineTypes.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    website: text("website"),
    status: restaurantStatusEnum("status").notNull().default("want_to_try"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    googlePlaceId: text("google_place_id"),
    googleRating: numeric("google_rating", { precision: 2, scale: 1 }),
    googleRatingsTotal: integer("google_ratings_total"),
    googleRatingFetchedAt: timestamp("google_rating_fetched_at"),
    // Google price level 1–4 ($ to $$$$), null if unknown.
    googlePriceLevel: integer("google_price_level"),
    // Snapshot of Google opening hours: { weekdayDescriptions?, periods?, utcOffsetMinutes? }.
    googleOpeningHours: jsonb("google_opening_hours"),
    // No FK constraint — avoids circular reference with restaurantPhotos table.
    // Cleared in the photos.delete procedure when the referenced photo is removed.
    coverPhotoId: uuid("cover_photo_id"),
    socialUrl: text("social_url"),
    addedByUserId: text("added_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    // Partial unique index: allows the same place_id to reappear after soft-delete.
    uniqueIndex("restaurants_google_place_id_unique")
      .on(table.googlePlaceId)
      .where(sql`${table.deletedAt} IS NULL`),
    index("restaurants_state_idx").on(table.state),
    index("restaurants_country_idx").on(table.country),
    index("restaurants_cuisine_type_id_idx").on(table.cuisineTypeId),
    index("restaurants_added_by_user_id_idx").on(table.addedByUserId),
    index("restaurants_status_idx").on(table.status),
  ]
);
