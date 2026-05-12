import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const cuisineTypes = pgTable("cuisine_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
