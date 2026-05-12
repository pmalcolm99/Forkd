import "server-only";
import { cache } from "react";
import { db, user } from "@forkd/db";
import { count } from "drizzle-orm";

export const passwordAuthEnabled = cache(async (): Promise<boolean> => {
  const env = process.env.PASSWORD_AUTH_ENABLED ?? "auto";
  if (env === "true") return true;
  if (env === "false") return false;
  // "auto": enabled only while zero users exist in the database
  const [result] = await db.select({ count: count() }).from(user);
  return (result?.count ?? 0) === 0;
});
