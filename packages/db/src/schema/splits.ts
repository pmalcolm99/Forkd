import {
  boolean,
  char,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { restaurants } from "./restaurants";

export const billSplitStatusEnum = pgEnum("bill_split_status", [
  "draft",
  "open",
  "settled",
  "archived",
]);

export const billSplitAiStatusEnum = pgEnum("bill_split_ai_status", [
  "none",
  "queued",
  "processing",
  "ready",
  "failed",
]);

export const billSplitAllocationEnum = pgEnum("bill_split_allocation", ["proportional", "even"]);

export const billSplitFxModeEnum = pgEnum("bill_split_fx_mode", ["none", "rate", "statement"]);

/**
 * Someone at the table. Either a Forkd user (`userId` set) or a named guest.
 *
 * A guest can be handed a `guestToken` link that reaches the app *outside*
 * Cloudflare Access, so the token is scoped to exactly this one row: it grants
 * read access to one bill and write access to this participant's own claims and
 * paid flag, nothing more.
 */
export const billSplitParticipants = pgTable(
  "bill_split_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => billSplits.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    isGuest: boolean("is_guest").notNull().default(false),
    guestToken: text("guest_token").unique(),
    guestTokenExpiresAt: timestamp("guest_token_expires_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("bill_split_participants_split_idx").on(table.splitId),
    // One participant row per Forkd user per bill. Guests (null userId) are
    // exempt, so several unnamed friends can be added.
    uniqueIndex("bill_split_participants_split_user_unique")
      .on(table.splitId, table.userId)
      .where(sql`${table.userId} is not null`),
  ]
);

/**
 * One restaurant bill being split.
 *
 * All money is integer cents. This departs from the numeric-as-string pattern
 * used for latitude/googleRating deliberately: the allocation algorithm in
 * @forkd/shared splitMath relies on exact integer arithmetic so everyone's
 * shares sum to the receipt total to the cent.
 *
 * Amounts are in `currency` (what the receipt is printed in). `homeCurrency`
 * plus the fx fields describe how to present them in the family's own currency.
 */
export const billSplits = pgTable(
  "bill_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // Optional link back to the catalog. Set null so deleting a restaurant
    // never destroys the record of who owes whom.
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, {
      onDelete: "set null",
    }),
    merchantName: text("merchant_name"),
    purchasedAt: timestamp("purchased_at"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // The payer is a participant row, not a user row, so a guest can be the
    // one who fronted the bill.
    //
    // Deliberately has no FK constraint: splits and participants reference each
    // other, and a real circular FK makes Drizzle's type inference collapse to
    // `any`. Same trade-off (and same reason) as restaurants.coverPhotoId. The
    // ON DELETE SET NULL behaviour is done in code by splits.removeParticipant.
    paidByParticipantId: uuid("paid_by_participant_id"),

    currency: char("currency", { length: 3 }).notNull().default("USD"),
    homeCurrency: char("home_currency", { length: 3 }).notNull().default("USD"),
    fxMode: billSplitFxModeEnum("fx_mode").notNull().default("none"),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }),
    // What the bank actually charged, in home currency. Preferred over a
    // mid-market rate because it already includes the card's FX markup.
    statementTotalCents: integer("statement_total_cents"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    serviceCents: integer("service_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    // The total printed on the receipt. Compared against the sum of the parts
    // so a misread line item surfaces as a warning instead of skewing shares.
    totalCents: integer("total_cents").notNull().default(0),

    // True when tax is already inside the item prices (VAT/MwSt/IVA — i.e.
    // everywhere except the US). The receipt still prints a tax figure, but it
    // breaks down the subtotal rather than adding to it, so adding it again
    // overcharges everyone. Detected at extraction time and correctable in the UI.
    taxIncluded: boolean("tax_included").notNull().default(false),

    tipMode: billSplitAllocationEnum("tip_mode").notNull().default("proportional"),
    taxMode: billSplitAllocationEnum("tax_mode").notNull().default("proportional"),
    partySize: integer("party_size"),

    shareToken: text("share_token").notNull().unique(),
    shareEnabled: boolean("share_enabled").notNull().default(true),

    status: billSplitStatusEnum("status").notNull().default("draft"),
    aiStatus: billSplitAiStatusEnum("ai_status").notNull().default("none"),
    aiError: text("ai_error"),

    // Receipts often print a card's last four digits and an auth code. When set,
    // only the creator sees the raw images; everyone else still gets the items.
    hideImagesFromOthers: boolean("hide_images_from_others").notNull().default(false),

    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("bill_splits_created_by_idx").on(table.createdByUserId),
    index("bill_splits_restaurant_idx").on(table.restaurantId),
    index("bill_splits_created_at_idx").on(table.createdAt),
  ]
);

export const billSplitImages = pgTable(
  "bill_split_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => billSplits.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    filePath: text("file_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    width: integer("width"),
    height: integer("height"),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("bill_split_images_split_idx").on(table.splitId)]
);

export const billSplitItems = pgTable(
  "bill_split_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => billSplits.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unitPriceCents: integer("unit_price_cents"),
    totalCents: integer("total_cents").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("bill_split_items_split_idx").on(table.splitId)]
);

/**
 * "This person ordered this item." `shares` is a relative weight, which is what
 * makes both shared plates and quantity splitting work: three people on one
 * appetizer are 1/1/1; someone who took two of a qty-3 item is 2 against 1.
 */
export const billSplitClaims = pgTable(
  "bill_split_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => billSplits.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => billSplitItems.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => billSplitParticipants.id, { onDelete: "cascade" }),
    shares: integer("shares").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("bill_split_claims_split_idx").on(table.splitId),
    index("bill_split_claims_participant_idx").on(table.participantId),
    unique("bill_split_claims_item_participant_unique").on(table.itemId, table.participantId),
  ]
);
