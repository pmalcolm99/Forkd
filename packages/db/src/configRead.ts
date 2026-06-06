import { eq } from "drizzle-orm";
import type { db as dbType } from "./client";
import { appConfig } from "./schema/index";
import { decrypt } from "./crypto";

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
