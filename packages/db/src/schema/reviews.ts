import { check, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { restaurants } from "./restaurants";

export const restaurantReviews = pgTable(
  "restaurant_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stars: smallint("stars"),
    text: text("text"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("restaurant_reviews_restaurant_user_unique").on(table.restaurantId, table.userId),
    check(
      "stars_range",
      sql`${table.stars} IS NULL OR (${table.stars} >= 1 AND ${table.stars} <= 5)`
    ),
  ]
);
