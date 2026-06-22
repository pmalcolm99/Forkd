import type { db as dbType } from "./client";
import { appConfig } from "./schema/index";

/**
 * Upsert a non-secret app_config value. Used by background jobs (e.g. the backup
 * engine toggling maintenance_mode) that don't go through the tRPC config router.
 * Secrets must still be written via the encrypting config.set path.
 */
export async function setConfigValue(db: typeof dbType, key: string, value: string): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, isSecret: false })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
}
