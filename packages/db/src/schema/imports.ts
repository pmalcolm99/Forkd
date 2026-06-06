import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { restaurants } from "./restaurants";

export const importStatusEnum = pgEnum("import_status", [
  "queued",
  "downloading",
  "transcribing",
  "extracting",
  "completed",
  "failed",
  "duplicate_found",
]);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  status: importStatusEnum("status").notNull().default("queued"),
  step: text("step"),
  errorMessage: text("error_message"),
  restaurantId: uuid("restaurant_id").references(() => restaurants.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
