import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { restaurants } from "./restaurants";

export const restaurantPhotos = pgTable("restaurant_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  filePath: text("file_path").notNull(),
  thumbPath: text("thumb_path").notNull(),
  width: integer("width"),
  height: integer("height"),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
