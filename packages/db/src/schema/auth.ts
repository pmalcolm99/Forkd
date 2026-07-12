import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull(),
    name: text("name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    image: text("image"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isOwner: boolean("is_owner").notNull().default(false),
    homeState: text("home_state"),
    // Selected UI theme id (see @forkd/shared THEMES). Null falls back to default.
    theme: text("theme"),
    // "current_location" | "home_state" — how the Map page initially focuses.
    // Null falls back to current_location.
    mapDefaultView: text("map_default_view"),
    // JSON: { restaurants?: {...filters}, map?: {...filters} } applied on page load.
    defaultFilters: text("default_filters"),
    // App version whose changelog the user has already seen (gates the popup).
    lastSeenChangelogVersion: text("last_seen_changelog_version"),
    lastActiveAt: timestamp("last_active_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("one_owner")
      .on(table.isOwner)
      .where(sql`${table.isOwner} = true`),
  ]
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
