import { eq } from "drizzle-orm";
import type { db as dbType } from "@forkd/db";
import { appConfig } from "@forkd/db";
import { decrypt } from "../crypto";

/**
 * Retrieve and (if secret) decrypt a config value from the database.
 * Returns null when the key has no row (i.e. not yet configured).
 * Used by Phases 7, 8, 10 to read plaintext API keys for outbound calls.
 */
export async function getDecryptedConfigValue(
  key: string,
  db: typeof dbType
): Promise<string | null> {
  const rows = await db
    .select({ value: appConfig.value, isSecret: appConfig.isSecret })
    .from(appConfig)
    .where(eq(appConfig.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return row.isSecret ? decrypt(row.value) : row.value;
}
