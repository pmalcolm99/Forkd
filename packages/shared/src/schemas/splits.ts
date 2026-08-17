import { z } from "zod";
import { DEFAULT_CURRENCY, isValidCurrencyCode } from "../currencies";

export const MAX_RECEIPT_IMAGES = 2;

/**
 * Hard server-side ceiling for a receipt upload.
 *
 * Generous on purpose: phone cameras produce 12–48MP files that are routinely
 * 5–20 MB, and the browser downscales before upload anyway (see
 * `clientImageResize.ts`). This limit only has to catch the cases the browser
 * couldn't handle — chiefly HEIC on a browser that can't decode it — plus
 * outright abuse. Sharp resizes whatever arrives down to RECEIPT_FULL_MAX.
 */
export const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;

/**
 * Long edge the browser resizes a receipt photo to before uploading. Matches
 * RECEIPT_FULL_MAX, so the client-side resize loses nothing the server wouldn't
 * have discarded anyway.
 */
export const RECEIPT_UPLOAD_MAX_EDGE = 1568;

/** Below this, a correctly-sized photo is uploaded as-is rather than re-encoded. */
export const RECEIPT_REENCODE_ABOVE_BYTES = 1.5 * 1024 * 1024;
export const SPLIT_TITLE_MAX = 200;
export const SPLIT_ITEM_LABEL_MAX = 200;
export const SPLIT_NOTES_MAX = 2000;
export const SPLIT_PARTICIPANT_NAME_MAX = 80;
export const MAX_SPLIT_ITEMS = 200;
export const MAX_SPLIT_PARTICIPANTS = 50;

export const splitStatusEnum = z.enum(["draft", "open", "settled", "archived"]);
export type SplitStatus = z.infer<typeof splitStatusEnum>;

export const splitAiStatusEnum = z.enum(["none", "queued", "processing", "ready", "failed"]);
export type SplitAiStatus = z.infer<typeof splitAiStatusEnum>;

export const splitAllocationEnum = z.enum(["proportional", "even"]);
export type SplitAllocation = z.infer<typeof splitAllocationEnum>;

export const splitFxModeEnum = z.enum(["none", "rate", "statement"]);
export type SplitFxMode = z.infer<typeof splitFxModeEnum>;

/** Terminal AI states — the UI stops polling on these. */
export const TERMINAL_AI_STATUSES: ReadonlySet<SplitAiStatus> = new Set<SplitAiStatus>([
  "none",
  "ready",
  "failed",
]);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidCurrencyCode, { message: "Must be a 3-letter currency code." });

/** Money is integer cents everywhere. Capped at ±$10M to keep the math safe. */
const cents = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const nonNegativeCents = z.number().int().min(0).max(1_000_000_000);

export const createSplitInput = z.object({
  title: z.string().trim().min(1).max(SPLIT_TITLE_MAX),
  restaurantId: z.string().uuid().nullish(),
  currency: currencyCode.default(DEFAULT_CURRENCY),
});
export type CreateSplitInput = z.infer<typeof createSplitInput>;

export const updateSplitInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(SPLIT_TITLE_MAX).optional(),
  restaurantId: z.string().uuid().nullish(),
  merchantName: z.string().trim().max(200).nullish(),
  purchasedAt: z.coerce.date().nullish(),
  paidByParticipantId: z.string().uuid().nullish(),
  currency: currencyCode.optional(),
  homeCurrency: currencyCode.optional(),
  fxMode: splitFxModeEnum.optional(),
  fxRate: z.number().positive().max(1_000_000).nullish(),
  statementTotalCents: nonNegativeCents.nullish(),
  taxCents: nonNegativeCents.optional(),
  taxIncluded: z.boolean().optional(),
  tipCents: nonNegativeCents.optional(),
  serviceCents: nonNegativeCents.optional(),
  discountCents: nonNegativeCents.optional(),
  totalCents: nonNegativeCents.optional(),
  tipMode: splitAllocationEnum.optional(),
  taxMode: splitAllocationEnum.optional(),
  partySize: z.number().int().min(1).max(100).nullish(),
  status: splitStatusEnum.optional(),
  hideImagesFromOthers: z.boolean().optional(),
  notes: z.string().max(SPLIT_NOTES_MAX).nullish(),
});
export type UpdateSplitInput = z.infer<typeof updateSplitInput>;

export const splitItemFields = z.object({
  label: z.string().trim().min(1).max(SPLIT_ITEM_LABEL_MAX),
  quantity: z.number().positive().max(1000).default(1),
  unitPriceCents: cents.nullish(),
  totalCents: cents,
  notes: z.string().max(500).nullish(),
});

export const upsertSplitItemInput = z.object({
  splitId: z.string().uuid(),
  /** Omit to create a new row. */
  id: z.string().uuid().nullish(),
  position: z.number().int().min(0).max(MAX_SPLIT_ITEMS).optional(),
  ...splitItemFields.shape,
});
export type UpsertSplitItemInput = z.infer<typeof upsertSplitItemInput>;

/** Wholesale replacement of the item list — what the review step submits. */
export const replaceSplitItemsInput = z.object({
  splitId: z.string().uuid(),
  items: z.array(splitItemFields).max(MAX_SPLIT_ITEMS),
});
export type ReplaceSplitItemsInput = z.infer<typeof replaceSplitItemsInput>;

export const deleteSplitItemInput = z.object({ id: z.string().uuid() });

export const addParticipantInput = z
  .object({
    splitId: z.string().uuid(),
    /** A Forkd user, or null for a named guest. */
    userId: z.string().nullish(),
    displayName: z.string().trim().min(1).max(SPLIT_PARTICIPANT_NAME_MAX).nullish(),
  })
  .refine((v) => !!v.userId || !!v.displayName, {
    message: "Pick a family member or enter a name.",
  });
export type AddParticipantInput = z.infer<typeof addParticipantInput>;

export const renameParticipantInput = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(SPLIT_PARTICIPANT_NAME_MAX),
});

export const removeParticipantInput = z.object({ id: z.string().uuid() });

/**
 * Replace one participant's claims across a whole bill. Sending the full set
 * (rather than per-item toggles) keeps the client and server in sync without a
 * round-trip per tap, and makes the whole update atomic.
 */
export const setClaimsInput = z.object({
  splitId: z.string().uuid(),
  participantId: z.string().uuid(),
  claims: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        shares: z.number().int().min(1).max(100).default(1),
      })
    )
    .max(MAX_SPLIT_ITEMS),
});
export type SetClaimsInput = z.infer<typeof setClaimsInput>;

export const setPaidInput = z.object({
  participantId: z.string().uuid(),
  paid: z.boolean(),
});

export const splitIdInput = z.object({ id: z.string().uuid() });
export const splitTokenInput = z.object({ token: z.string().min(10).max(200) });

export const listSplitsInput = z.object({
  includeArchived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListSplitsInput = z.infer<typeof listSplitsInput>;

export const uploadReceiptFormSchema = z.object({
  splitId: z.string().uuid(),
});

export const fxRateInput = z.object({
  from: currencyCode,
  to: currencyCode,
  /** ISO date (YYYY-MM-DD). Omit for the latest published rate. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

/* -------------------------------------------------------------------------- */
/* Guest link payloads (REST, outside tRPC)                                    */
/* -------------------------------------------------------------------------- */

export const guestTokenSchema = z.string().min(20).max(200);

export const guestClaimsBody = z.object({
  token: guestTokenSchema,
  claims: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        shares: z.number().int().min(1).max(100).default(1),
      })
    )
    .max(MAX_SPLIT_ITEMS),
});
export type GuestClaimsBody = z.infer<typeof guestClaimsBody>;

export const guestPaidBody = z.object({
  token: guestTokenSchema,
  paid: z.boolean(),
});
