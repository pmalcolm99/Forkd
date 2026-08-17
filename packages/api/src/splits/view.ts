import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { db as DbType } from "@forkd/db";
import {
  billSplits,
  billSplitClaims,
  billSplitImages,
  billSplitItems,
  billSplitParticipants,
  getDecryptedConfigValue,
} from "@forkd/db";
import { computeSplit, effectiveFxRate, type SplitMathResult } from "@forkd/shared";

/** URL-safe, unguessable. 24 bytes for share links, 32 for guest links. */
export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export interface SplitViewParticipant {
  id: string;
  userId: string | null;
  displayName: string;
  isGuest: boolean;
  paidAt: Date | null;
  hasGuestLink: boolean;
  guestLinkExpiresAt: Date | null;
}

export interface SplitViewItem {
  id: string;
  position: number;
  label: string;
  quantity: number;
  unitPriceCents: number | null;
  totalCents: number;
  notes: string | null;
  claims: { participantId: string; shares: number }[];
}

export type SplitView = Awaited<ReturnType<typeof buildSplitView>>;

/**
 * Assemble a whole bill — header, images, items with claims, participants —
 * plus the computed per-person breakdown.
 *
 * Shared by the tRPC router and the guest REST handlers so both surfaces
 * always agree on the numbers. `redact` strips anything a guest shouldn't see.
 */
export async function buildSplitView(
  db: typeof DbType,
  splitId: string,
  opts: { redact?: boolean; viewerUserId?: string | null } = {}
) {
  const split = await db.query.billSplits.findFirst({
    where: and(eq(billSplits.id, splitId), isNull(billSplits.deletedAt)),
    with: {
      restaurant: { columns: { id: true, name: true } },
      createdBy: { columns: { id: true, firstName: true, lastName: true, name: true } },
    },
  });
  if (!split) return null;

  const [images, itemRows, participantRows, claimRows] = await Promise.all([
    db
      .select()
      .from(billSplitImages)
      .where(eq(billSplitImages.splitId, splitId))
      .orderBy(asc(billSplitImages.position)),
    db
      .select()
      .from(billSplitItems)
      .where(eq(billSplitItems.splitId, splitId))
      .orderBy(asc(billSplitItems.position), asc(billSplitItems.createdAt)),
    db.query.billSplitParticipants.findMany({
      where: eq(billSplitParticipants.splitId, splitId),
      with: {
        user: {
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            venmoHandle: true,
            cashAppHandle: true,
            paymentNote: true,
          },
        },
      },
      orderBy: [asc(billSplitParticipants.createdAt)],
    }),
    db.select().from(billSplitClaims).where(eq(billSplitClaims.splitId, splitId)),
  ]);

  const claimsByItem = new Map<string, { participantId: string; shares: number }[]>();
  for (const c of claimRows) {
    const list = claimsByItem.get(c.itemId) ?? [];
    list.push({ participantId: c.participantId, shares: c.shares });
    claimsByItem.set(c.itemId, list);
  }

  const items: SplitViewItem[] = itemRows.map((it) => ({
    id: it.id,
    position: it.position,
    label: it.label,
    quantity: Number(it.quantity),
    unitPriceCents: it.unitPriceCents,
    totalCents: it.totalCents,
    notes: it.notes,
    claims: claimsByItem.get(it.id) ?? [],
  }));

  const participants = participantRows.map((p) => ({
    id: p.id,
    userId: p.userId,
    displayName: p.displayName,
    isGuest: p.isGuest,
    paidAt: p.paidAt,
    hasGuestLink: !!p.guestToken,
    guestLinkExpiresAt: p.guestTokenExpiresAt,
    // Payment handles are only useful for whoever fronted the bill; they're
    // filtered down to the payer below so nobody else's details travel.
    payment:
      p.id === split.paidByParticipantId && p.user
        ? {
            venmoHandle: p.user.venmoHandle,
            cashAppHandle: p.user.cashAppHandle,
            paymentNote: p.user.paymentNote,
          }
        : null,
  }));

  const math: SplitMathResult = computeSplit({
    items: items.map((it) => ({ id: it.id, totalCents: it.totalCents, claims: it.claims })),
    participantIds: participants.map((p) => p.id),
    taxCents: split.taxCents,
    taxIncluded: split.taxIncluded,
    tipCents: split.tipCents,
    serviceCents: split.serviceCents,
    discountCents: split.discountCents,
    tipMode: split.tipMode,
    taxMode: split.taxMode,
    partySize: split.partySize,
  });

  const fxRate = effectiveFxRate({
    fxMode: split.fxMode,
    fxRate: split.fxRate == null ? null : Number(split.fxRate),
    statementTotalCents: split.statementTotalCents,
    receiptTotalCents: split.totalCents,
  });

  const canSeeImages =
    !split.hideImagesFromOthers ||
    (!!opts.viewerUserId && opts.viewerUserId === split.createdByUserId);

  return {
    id: split.id,
    title: split.title,
    restaurantId: split.restaurantId,
    restaurant: split.restaurant,
    merchantName: split.merchantName,
    purchasedAt: split.purchasedAt,
    createdByUserId: opts.redact ? null : split.createdByUserId,
    createdBy: opts.redact
      ? null
      : split.createdBy
        ? {
            id: split.createdBy.id,
            name:
              [split.createdBy.firstName, split.createdBy.lastName].filter(Boolean).join(" ") ||
              split.createdBy.name,
          }
        : null,
    paidByParticipantId: split.paidByParticipantId,
    currency: split.currency,
    homeCurrency: split.homeCurrency,
    fxMode: split.fxMode,
    fxRate: split.fxRate == null ? null : Number(split.fxRate),
    statementTotalCents: split.statementTotalCents,
    effectiveFxRate: fxRate,
    subtotalCents: split.subtotalCents,
    taxCents: split.taxCents,
    taxIncluded: split.taxIncluded,
    tipCents: split.tipCents,
    serviceCents: split.serviceCents,
    discountCents: split.discountCents,
    totalCents: split.totalCents,
    tipMode: split.tipMode,
    taxMode: split.taxMode,
    partySize: split.partySize,
    status: split.status,
    aiStatus: split.aiStatus,
    aiError: split.aiError,
    hideImagesFromOthers: split.hideImagesFromOthers,
    notes: split.notes,
    shareToken: opts.redact ? null : split.shareToken,
    shareEnabled: split.shareEnabled,
    createdAt: split.createdAt,
    updatedAt: split.updatedAt,
    images: canSeeImages ? images.map((i) => ({ id: i.id, width: i.width, height: i.height })) : [],
    items,
    participants,
    math,
    /** True when the sum of the parts disagrees with the receipt's own total. */
    totalMismatchCents: split.totalCents - math.grandTotalCents,
  };
}

/**
 * Guest links reach the app outside Cloudflare Access, so they stay off by default.
 *
 * Cached briefly because this is checked on every request to the one publicly
 * reachable surface in the app — without it, anyone who can reach the guest
 * endpoints can make us do an unbounded number of DB reads just by calling them.
 * Mirrors the `maintenanceCache` pattern in trpc.ts; 5s is short enough that
 * flipping the switch in Admin takes effect essentially immediately.
 */
let guestLinksCache: { value: boolean; at: number } | null = null;
const GUEST_FLAG_TTL_MS = 5000;

export async function guestLinksEnabled(db: typeof DbType): Promise<boolean> {
  const now = Date.now();
  if (guestLinksCache && now - guestLinksCache.at < GUEST_FLAG_TTL_MS) {
    return guestLinksCache.value;
  }
  const raw = await getDecryptedConfigValue("receipts.guest_links_enabled", db).catch(() => null);
  const value = raw === "true";
  guestLinksCache = { value, at: now };
  return value;
}

/** Test seam — drops the cached flag. */
export function _resetGuestLinksCache(): void {
  guestLinksCache = null;
}

export async function guestLinkTtlDays(db: typeof DbType): Promise<number> {
  const raw = await getDecryptedConfigValue("receipts.guest_link_ttl_days", db).catch(() => null);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}
