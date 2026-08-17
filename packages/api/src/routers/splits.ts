import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import z from "zod";
import {
  billSplits,
  billSplitClaims,
  billSplitImages,
  billSplitItems,
  billSplitParticipants,
  user as userTable,
} from "@forkd/db";
import type { db as DbType } from "@forkd/db";
import { receiptQueue } from "@forkd/queue";
import {
  addParticipantInput,
  createSplitInput,
  deleteSplitItemInput,
  fxRateInput,
  listSplitsInput,
  logger,
  removeParticipantInput,
  renameParticipantInput,
  replaceSplitItemsInput,
  setClaimsInput,
  setPaidInput,
  splitIdInput,
  splitTokenInput,
  updateSplitInput,
  upsertSplitItemInput,
  computeSplit,
} from "@forkd/shared";
import { protectedProcedure, router } from "../trpc";
import { buildSplitView, guestLinkTtlDays, guestLinksEnabled, newToken } from "../splits/view";

// Better Auth types isAdmin/isOwner as boolean | null | undefined, so the
// helpers below take the loose shape and coerce at the comparison.
type SplitActor = {
  id: string;
  isAdmin?: boolean | null;
  isOwner?: boolean | null;
};
type Ctx = { db: typeof DbType; user: SplitActor };

async function loadSplit(ctx: Ctx, id: string) {
  const split = await ctx.db.query.billSplits.findFirst({
    where: and(eq(billSplits.id, id), isNull(billSplits.deletedAt)),
  });
  if (!split) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
  return split;
}

function canEdit(split: { createdByUserId: string | null }, u: SplitActor): boolean {
  return split.createdByUserId === u.id || !!u.isAdmin || !!u.isOwner;
}

async function assertCanEdit(ctx: Ctx, id: string) {
  const split = await loadSplit(ctx, id);
  if (!canEdit(split, ctx.user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the person who created this bill can change it.",
    });
  }
  return split;
}

/** Keep the stored subtotal in step with the items after any item change. */
async function refreshSubtotal(db: typeof DbType, splitId: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${billSplitItems.totalCents}), 0)::int` })
    .from(billSplitItems)
    .where(eq(billSplitItems.splitId, splitId));
  await db
    .update(billSplits)
    .set({ subtotalCents: row?.total ?? 0, updatedAt: new Date() })
    .where(eq(billSplits.id, splitId));
}

function displayNameFor(u: {
  firstName: string | null;
  lastName: string | null;
  name: string;
}): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name;
}

export const splitsRouter = router({
  /** Bills you created, or that you're a participant on. */
  list: protectedProcedure.input(listSplitsInput).query(async ({ input, ctx }) => {
    const mine = ctx.db
      .select({ splitId: billSplitParticipants.splitId })
      .from(billSplitParticipants)
      .where(eq(billSplitParticipants.userId, ctx.user.id));

    const rows = await ctx.db.query.billSplits.findMany({
      where: and(
        isNull(billSplits.deletedAt),
        input.includeArchived ? undefined : sql`${billSplits.status} <> 'archived'`,
        or(eq(billSplits.createdByUserId, ctx.user.id), inArray(billSplits.id, mine))
      ),
      with: {
        restaurant: { columns: { id: true, name: true } },
        participants: { columns: { id: true, userId: true, paidAt: true } },
        items: { columns: { id: true, totalCents: true } },
      },
      orderBy: [desc(billSplits.createdAt)],
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });

    // Enough to render a card without shipping the whole graph: the viewer's
    // own share needs the real math, so compute it per row.
    const claimRows = rows.length
      ? await ctx.db
          .select()
          .from(billSplitClaims)
          .where(
            inArray(
              billSplitClaims.splitId,
              rows.map((r) => r.id)
            )
          )
      : [];

    return rows.map((r) => {
      const claims = claimRows.filter((c) => c.splitId === r.id);
      const math = computeSplit({
        items: r.items.map((it) => ({
          id: it.id,
          totalCents: it.totalCents,
          claims: claims
            .filter((c) => c.itemId === it.id)
            .map((c) => ({ participantId: c.participantId, shares: c.shares })),
        })),
        participantIds: r.participants.map((p) => p.id),
        taxCents: r.taxCents,
        tipCents: r.tipCents,
        serviceCents: r.serviceCents,
        discountCents: r.discountCents,
        tipMode: r.tipMode,
        taxMode: r.taxMode,
        partySize: r.partySize,
        taxIncluded: r.taxIncluded,
      });

      const me = r.participants.find((p) => p.userId === ctx.user.id);
      const myShare = me
        ? (math.participants.find((p) => p.participantId === me.id)?.totalCents ?? 0)
        : null;

      return {
        id: r.id,
        title: r.title,
        merchantName: r.merchantName,
        restaurant: r.restaurant,
        purchasedAt: r.purchasedAt,
        currency: r.currency,
        totalCents: r.totalCents,
        status: r.status,
        aiStatus: r.aiStatus,
        createdAt: r.createdAt,
        participantCount: r.participants.length,
        unclaimedCount: math.unclaimedItemIds.length,
        itemCount: r.items.length,
        myShareCents: myShare,
        myPaidAt: me?.paidAt ?? null,
        isMine: r.createdByUserId === ctx.user.id,
      };
    });
  }),

  get: protectedProcedure.input(splitIdInput).query(async ({ input, ctx }) => {
    const view = await buildSplitView(ctx.db, input.id, { viewerUserId: ctx.user.id });
    if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
    const me = view.participants.find((p) => p.userId === ctx.user.id) ?? null;
    return {
      ...view,
      canEdit: canEdit({ createdByUserId: view.createdByUserId }, ctx.user),
      myParticipantId: me?.id ?? null,
    };
  }),

  /** Resolve a share link. Any signed-in Forkd user with the token may view. */
  getByShareToken: protectedProcedure.input(splitTokenInput).query(async ({ input, ctx }) => {
    const split = await ctx.db.query.billSplits.findFirst({
      where: and(eq(billSplits.shareToken, input.token), isNull(billSplits.deletedAt)),
      columns: { id: true, shareEnabled: true },
    });
    if (!split || !split.shareEnabled) {
      throw new TRPCError({ code: "NOT_FOUND", message: "This link is no longer active." });
    }
    const view = await buildSplitView(ctx.db, split.id, { viewerUserId: ctx.user.id });
    if (!view) throw new TRPCError({ code: "NOT_FOUND" });

    const me = view.participants.find((p) => p.userId === ctx.user.id) ?? null;
    return {
      ...view,
      canEdit: canEdit({ createdByUserId: view.createdByUserId }, ctx.user),
      myParticipantId: me?.id ?? null,
    };
  }),

  create: protectedProcedure.input(createSplitInput).mutation(async ({ input, ctx }) => {
    const [row] = await ctx.db
      .insert(billSplits)
      .values({
        title: input.title,
        restaurantId: input.restaurantId ?? null,
        currency: input.currency,
        createdByUserId: ctx.user.id,
        shareToken: newToken(24),
      })
      .returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // The creator is at the table by default — one less step before claiming.
    const me = await ctx.db.query.user.findFirst({
      where: eq(userTable.id, ctx.user.id),
      columns: { id: true, firstName: true, lastName: true, name: true },
    });
    const [participant] = await ctx.db
      .insert(billSplitParticipants)
      .values({
        splitId: row.id,
        userId: ctx.user.id,
        displayName: me ? displayNameFor(me) : "Me",
      })
      .returning();

    // They almost always paid, so pre-select them as the payer.
    if (participant) {
      await ctx.db
        .update(billSplits)
        .set({ paidByParticipantId: participant.id })
        .where(eq(billSplits.id, row.id));
    }

    return { id: row.id };
  }),

  update: protectedProcedure.input(updateSplitInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.id);
    const { id, ...rest } = input;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    // numeric columns take strings in Drizzle
    if (rest.fxRate !== undefined) patch.fxRate = rest.fxRate == null ? null : String(rest.fxRate);

    const [row] = await ctx.db
      .update(billSplits)
      .set(patch)
      .where(eq(billSplits.id, id))
      .returning();
    return row;
  }),

  delete: protectedProcedure.input(splitIdInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.id);

    // Remove the receipt photos from disk before soft-deleting the row — the
    // images are the sensitive part and there is no undelete in the UI.
    const images = await ctx.db
      .select()
      .from(billSplitImages)
      .where(eq(billSplitImages.splitId, input.id));
    for (const img of images) {
      try {
        await ctx.fileStore?.deleteReceiptFiles?.(input.id, img.id);
      } catch (err) {
        logger.error({ splitId: input.id, imageId: img.id, err }, "Failed to delete receipt files");
      }
    }
    await ctx.db.delete(billSplitImages).where(eq(billSplitImages.splitId, input.id));

    await ctx.db
      .update(billSplits)
      .set({ deletedAt: new Date(), shareEnabled: false, updatedAt: new Date() })
      .where(eq(billSplits.id, input.id));
    return { success: true };
  }),

  /* ---------------------------------------------------------------- items */

  replaceItems: protectedProcedure
    .input(replaceSplitItemsInput)
    .mutation(async ({ input, ctx }) => {
      await assertCanEdit(ctx, input.splitId);
      await ctx.db.transaction(async (tx) => {
        await tx.delete(billSplitItems).where(eq(billSplitItems.splitId, input.splitId));
        if (input.items.length > 0) {
          await tx.insert(billSplitItems).values(
            input.items.map((it, i) => ({
              splitId: input.splitId,
              position: i,
              label: it.label,
              quantity: String(it.quantity),
              unitPriceCents: it.unitPriceCents ?? null,
              totalCents: it.totalCents,
              notes: it.notes ?? null,
            }))
          );
        }
      });
      await refreshSubtotal(ctx.db, input.splitId);
      return { success: true };
    }),

  upsertItem: protectedProcedure.input(upsertSplitItemInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.splitId);

    if (input.id) {
      const [row] = await ctx.db
        .update(billSplitItems)
        .set({
          label: input.label,
          quantity: String(input.quantity),
          unitPriceCents: input.unitPriceCents ?? null,
          totalCents: input.totalCents,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(billSplitItems.id, input.id), eq(billSplitItems.splitId, input.splitId)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });
      await refreshSubtotal(ctx.db, input.splitId);
      return row;
    }

    const [maxRow] = await ctx.db
      .select({ n: count() })
      .from(billSplitItems)
      .where(eq(billSplitItems.splitId, input.splitId));
    const [row] = await ctx.db
      .insert(billSplitItems)
      .values({
        splitId: input.splitId,
        position: input.position ?? maxRow?.n ?? 0,
        label: input.label,
        quantity: String(input.quantity),
        unitPriceCents: input.unitPriceCents ?? null,
        totalCents: input.totalCents,
        notes: input.notes ?? null,
      })
      .returning();
    await refreshSubtotal(ctx.db, input.splitId);
    return row;
  }),

  deleteItem: protectedProcedure.input(deleteSplitItemInput).mutation(async ({ input, ctx }) => {
    const item = await ctx.db.query.billSplitItems.findFirst({
      where: eq(billSplitItems.id, input.id),
    });
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    await assertCanEdit(ctx, item.splitId);

    await ctx.db.delete(billSplitItems).where(eq(billSplitItems.id, input.id));
    await refreshSubtotal(ctx.db, item.splitId);
    return { success: true };
  }),

  /* --------------------------------------------------------- participants */

  addParticipant: protectedProcedure.input(addParticipantInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.splitId);

    let displayName = input.displayName?.trim() ?? "";
    if (input.userId) {
      const u = await ctx.db.query.user.findFirst({
        where: eq(userTable.id, input.userId),
        columns: { id: true, firstName: true, lastName: true, name: true },
      });
      if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "That person isn't in Forkd." });
      displayName = displayName || displayNameFor(u);

      const existing = await ctx.db.query.billSplitParticipants.findFirst({
        where: and(
          eq(billSplitParticipants.splitId, input.splitId),
          eq(billSplitParticipants.userId, input.userId)
        ),
      });
      if (existing) return existing;
    }

    const [row] = await ctx.db
      .insert(billSplitParticipants)
      .values({
        splitId: input.splitId,
        userId: input.userId ?? null,
        displayName,
        isGuest: !input.userId,
      })
      .returning();
    return row;
  }),

  /** "That's me" on a share link — adds the viewer as a participant. */
  joinAsSelf: protectedProcedure.input(splitIdInput).mutation(async ({ input, ctx }) => {
    const split = await loadSplit(ctx, input.id);
    if (!split.shareEnabled && !canEdit(split, ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This bill is no longer shared." });
    }

    const existing = await ctx.db.query.billSplitParticipants.findFirst({
      where: and(
        eq(billSplitParticipants.splitId, input.id),
        eq(billSplitParticipants.userId, ctx.user.id)
      ),
    });
    if (existing) return existing;

    const me = await ctx.db.query.user.findFirst({
      where: eq(userTable.id, ctx.user.id),
      columns: { id: true, firstName: true, lastName: true, name: true },
    });
    const [row] = await ctx.db
      .insert(billSplitParticipants)
      .values({
        splitId: input.id,
        userId: ctx.user.id,
        displayName: me ? displayNameFor(me) : "Someone",
      })
      .returning();
    return row;
  }),

  renameParticipant: protectedProcedure
    .input(renameParticipantInput)
    .mutation(async ({ input, ctx }) => {
      const p = await ctx.db.query.billSplitParticipants.findFirst({
        where: eq(billSplitParticipants.id, input.id),
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanEdit(ctx, p.splitId);

      const [row] = await ctx.db
        .update(billSplitParticipants)
        .set({ displayName: input.displayName })
        .where(eq(billSplitParticipants.id, input.id))
        .returning();
      return row;
    }),

  removeParticipant: protectedProcedure
    .input(removeParticipantInput)
    .mutation(async ({ input, ctx }) => {
      const p = await ctx.db.query.billSplitParticipants.findFirst({
        where: eq(billSplitParticipants.id, input.id),
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      const split = await assertCanEdit(ctx, p.splitId);

      // paid_by_participant_id has no FK (see the schema comment), so the
      // ON DELETE SET NULL behaviour is done here.
      if (split.paidByParticipantId === input.id) {
        await ctx.db
          .update(billSplits)
          .set({ paidByParticipantId: null, updatedAt: new Date() })
          .where(eq(billSplits.id, p.splitId));
      }
      await ctx.db.delete(billSplitParticipants).where(eq(billSplitParticipants.id, input.id));
      return { success: true };
    }),

  /* --------------------------------------------------------------- claims */

  setClaims: protectedProcedure.input(setClaimsInput).mutation(async ({ input, ctx }) => {
    const split = await loadSplit(ctx, input.splitId);
    const participant = await ctx.db.query.billSplitParticipants.findFirst({
      where: and(
        eq(billSplitParticipants.id, input.participantId),
        eq(billSplitParticipants.splitId, input.splitId)
      ),
    });
    if (!participant) throw new TRPCError({ code: "NOT_FOUND" });

    // You may always edit your own claims; editing someone else's is a
    // creator/admin/owner action.
    const isSelf = participant.userId === ctx.user.id;
    if (!isSelf && !canEdit(split, ctx.user)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only pick your own items on this bill.",
      });
    }

    // Only accept item ids that actually belong to this bill.
    const validItems = await ctx.db
      .select({ id: billSplitItems.id })
      .from(billSplitItems)
      .where(eq(billSplitItems.splitId, input.splitId));
    const validIds = new Set(validItems.map((i) => i.id));
    const claims = input.claims.filter((c) => validIds.has(c.itemId));

    await ctx.db.transaction(async (tx) => {
      await tx
        .delete(billSplitClaims)
        .where(eq(billSplitClaims.participantId, input.participantId));
      if (claims.length > 0) {
        await tx.insert(billSplitClaims).values(
          claims.map((c) => ({
            splitId: input.splitId,
            itemId: c.itemId,
            participantId: input.participantId,
            shares: c.shares,
          }))
        );
      }
    });
    return { success: true };
  }),

  setPaid: protectedProcedure.input(setPaidInput).mutation(async ({ input, ctx }) => {
    const p = await ctx.db.query.billSplitParticipants.findFirst({
      where: eq(billSplitParticipants.id, input.participantId),
    });
    if (!p) throw new TRPCError({ code: "NOT_FOUND" });
    const split = await loadSplit(ctx, p.splitId);

    const isSelf = p.userId === ctx.user.id;
    if (!isSelf && !canEdit(split, ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });

    await ctx.db
      .update(billSplitParticipants)
      .set({ paidAt: input.paid ? new Date() : null })
      .where(eq(billSplitParticipants.id, input.participantId));
    return { success: true };
  }),

  /* ------------------------------------------------------------ AI + share */

  extract: protectedProcedure.input(splitIdInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.id);

    const [imgCount] = await ctx.db
      .select({ n: count() })
      .from(billSplitImages)
      .where(eq(billSplitImages.splitId, input.id));
    if ((imgCount?.n ?? 0) === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Add a photo of the receipt first.",
      });
    }

    // Same shape of budget guard as import.start — Claude vision is the most
    // expensive thing in the app and there is no billing ceiling behind it.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await ctx.db
      .select({ n: count() })
      .from(billSplits)
      .where(
        and(eq(billSplits.createdByUserId, ctx.user.id), gte(billSplits.updatedAt, oneHourAgo))
      );
    if ((recent?.n ?? 0) > 30) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many receipt scans in the last hour. Try again shortly.",
      });
    }

    await ctx.db
      .update(billSplits)
      .set({ aiStatus: "queued", aiError: null, updatedAt: new Date() })
      .where(eq(billSplits.id, input.id));

    await receiptQueue.add("extract", { splitId: input.id, userId: ctx.user.id });
    return { queued: true };
  }),

  extractStatus: protectedProcedure.input(splitIdInput).query(async ({ input, ctx }) => {
    const split = await ctx.db.query.billSplits.findFirst({
      where: eq(billSplits.id, input.id),
      columns: { id: true, aiStatus: true, aiError: true },
    });
    if (!split) throw new TRPCError({ code: "NOT_FOUND" });
    return { status: split.aiStatus, error: split.aiError };
  }),

  setShareEnabled: protectedProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await assertCanEdit(ctx, input.id);
      await ctx.db
        .update(billSplits)
        .set({ shareEnabled: input.enabled, updatedAt: new Date() })
        .where(eq(billSplits.id, input.id));
      return { success: true };
    }),

  regenerateShareToken: protectedProcedure.input(splitIdInput).mutation(async ({ input, ctx }) => {
    await assertCanEdit(ctx, input.id);
    const token = newToken(24);
    await ctx.db
      .update(billSplits)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(eq(billSplits.id, input.id));
    return { shareToken: token };
  }),

  /** Whether guest links are switched on (and the Cloudflare bypass configured). */
  guestLinksEnabled: protectedProcedure.query(async ({ ctx }) => {
    return { enabled: await guestLinksEnabled(ctx.db) };
  }),

  mintGuestLink: protectedProcedure
    .input(z.object({ participantId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await guestLinksEnabled(ctx.db))) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const p = await ctx.db.query.billSplitParticipants.findFirst({
        where: eq(billSplitParticipants.id, input.participantId),
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanEdit(ctx, p.splitId);

      const ttl = await guestLinkTtlDays(ctx.db);
      const token = newToken(32);
      await ctx.db
        .update(billSplitParticipants)
        .set({
          guestToken: token,
          guestTokenExpiresAt: new Date(Date.now() + ttl * 24 * 60 * 60 * 1000),
        })
        .where(eq(billSplitParticipants.id, input.participantId));

      logger.info(
        { event: "guest_link_minted", participantId: p.id, splitId: p.splitId, ttlDays: ttl },
        "Guest link minted"
      );
      return { token, expiresInDays: ttl };
    }),

  revokeGuestLink: protectedProcedure
    .input(z.object({ participantId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const p = await ctx.db.query.billSplitParticipants.findFirst({
        where: eq(billSplitParticipants.id, input.participantId),
      });
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanEdit(ctx, p.splitId);

      await ctx.db
        .update(billSplitParticipants)
        .set({ guestToken: null, guestTokenExpiresAt: null })
        .where(eq(billSplitParticipants.id, input.participantId));
      return { success: true };
    }),

  /* ------------------------------------------------------------------- fx */

  /**
   * Look up a conversion rate from the ECB feed via Frankfurter — free, no API
   * key, and it can quote a historical date so a trip receipt converts at the
   * rate on the day of the meal. Fixed host, so no arbitrary URL fetching.
   */
  fxRate: protectedProcedure.input(fxRateInput).query(async ({ input }) => {
    if (input.from === input.to) return { rate: 1, date: null, source: "identity" as const };

    const when = input.date ?? "latest";
    const url = `https://api.frankfurter.dev/v1/${when}?base=${encodeURIComponent(
      input.from
    )}&symbols=${encodeURIComponent(input.to)}`;

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) return { rate: null, date: null, source: "unavailable" as const };

      const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
      const rate = json.rates?.[input.to];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        return { rate: null, date: null, source: "unavailable" as const };
      }
      return { rate, date: json.date ?? null, source: "ecb" as const };
    } catch (err) {
      logger.warn(
        { event: "fx_lookup_failed", from: input.from, to: input.to, err },
        "FX lookup failed"
      );
      return { rate: null, date: null, source: "unavailable" as const };
    }
  }),

  /** Restaurants for the "link this bill to a place" picker. */
  restaurantOptions: protectedProcedure.query(async ({ ctx }) => {
    const { restaurants } = await import("@forkd/db");
    return ctx.db
      .select({ id: restaurants.id, name: restaurants.name })
      .from(restaurants)
      .where(isNull(restaurants.deletedAt))
      .orderBy(asc(restaurants.name))
      .limit(500);
  }),
});
