import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const backups = pgTable("backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  byteSize: bigint("byte_size", { mode: "bigint" }).notNull(),
  trigger: text("trigger").notNull(),
  triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
