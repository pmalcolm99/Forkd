import { sql } from "drizzle-orm";
import type { db as dbType } from "./client";
import { apiUsage } from "./schema/index";

export type ApiEndpoint = "search" | "details" | "photo";

/**
 * Increment today's counter for a third-party API endpoint. Fire-and-forget at
 * call sites (never block the actual request). `day` is the server-local date.
 */
export async function recordApiUsage(db: typeof dbType, endpoint: ApiEndpoint): Promise<void> {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await db
    .insert(apiUsage)
    .values({ day, endpoint, count: 1 })
    .onConflictDoUpdate({
      target: [apiUsage.day, apiUsage.endpoint],
      set: { count: sql`${apiUsage.count} + 1` },
    });
}
