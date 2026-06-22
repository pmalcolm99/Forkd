import { z, type ZodTypeAny } from "zod";

export type ConfigKeyDef = {
  key: string;
  isSecret: boolean;
  requiredRole: "admin" | "owner";
  valueType: "string";
  defaultValue?: string;
  validator?: ZodTypeAny;
};

export const CONFIG_KEYS = [
  {
    key: "ai.claude.api_key",
    isSecret: true,
    requiredRole: "admin",
    valueType: "string",
  },
  {
    key: "ai.claude.model",
    isSecret: false,
    requiredRole: "admin",
    valueType: "string",
    defaultValue: "claude-opus-4-7",
    validator: z.string().min(1),
  },
  {
    key: "transcription.api_key",
    isSecret: true,
    requiredRole: "admin",
    valueType: "string",
  },
  {
    key: "transcription.model",
    isSecret: false,
    requiredRole: "admin",
    valueType: "string",
    defaultValue: "whisper-1",
    validator: z.string().min(1),
  },
  {
    key: "google_places.api_key",
    isSecret: true,
    requiredRole: "admin",
    valueType: "string",
  },
  {
    key: "bootstrap_complete",
    isSecret: false,
    requiredRole: "owner",
    valueType: "string",
  },
  {
    key: "map.location_radius_miles",
    isSecret: false,
    requiredRole: "admin",
    valueType: "string",
    defaultValue: "25",
    validator: z.string().refine((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 500;
    }, "Must be a whole number between 1 and 500"),
  },
  {
    // Cron expression for scheduled backups. Empty string disables scheduling.
    key: "backup.schedule_cron",
    isSecret: false,
    requiredRole: "owner",
    valueType: "string",
    defaultValue: "",
  },
  {
    // Number of backups to keep; older ones are pruned after each new backup.
    key: "backup.retention_count",
    isSecret: false,
    requiredRole: "owner",
    valueType: "string",
    defaultValue: "30",
  },
  {
    // "true" while a restore is in progress — gates non-owner requests.
    key: "maintenance_mode",
    isSecret: false,
    requiredRole: "owner",
    valueType: "string",
    defaultValue: "false",
  },
] as const satisfies ConfigKeyDef[];

export const CONFIG_KEY_MAP = new Map<string, ConfigKeyDef>(
  CONFIG_KEYS.map((k) => [k.key, k as ConfigKeyDef])
);

export const configKeyEnum = z.enum(CONFIG_KEYS.map((k) => k.key) as [string, ...string[]]);
