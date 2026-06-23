import { date, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/**
 * Per-day counter of outbound third-party API calls (currently Google Places),
 * so the owner can watch usage/cost. One row per (day, endpoint), incremented on
 * each request. endpoint is e.g. "search" | "details" | "photo".
 */
export const apiUsage = pgTable(
  "api_usage",
  {
    day: date("day").notNull(),
    endpoint: text("endpoint").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.endpoint] })]
);
