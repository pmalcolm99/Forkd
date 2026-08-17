"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { Check } from "lucide-react";
import { computeSplit, moneyDisplay } from "@forkd/shared";

export interface ClaimBoardItem {
  id: string;
  label: string;
  quantity: number;
  totalCents: number;
  claims: { participantId: string; shares: number }[];
}

export interface ClaimBoardParticipant {
  id: string;
  displayName: string;
}

interface Props {
  items: ClaimBoardItem[];
  participants: ClaimBoardParticipant[];
  myParticipantId: string;
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  tipMode: "proportional" | "even";
  taxMode: "proportional" | "even";
  partySize: number | null;
  taxIncluded: boolean;
  onSave: (claims: { itemId: string; shares: number }[]) => Promise<void>;
  isSaving?: boolean;
  saveError?: string | null;
}

/**
 * Tap-to-claim item list with a live running total.
 *
 * Shared by the in-app bill page, the family share link, and the guest link, so
 * all three compute the same numbers from the same module. Tapping an item that
 * someone else already claimed adds you alongside them — that's how a shared
 * plate gets split, without a separate "share this" mode to discover.
 */
export function ClaimBoard({
  items,
  participants,
  myParticipantId,
  currency,
  homeCurrency,
  effectiveFxRate,
  taxCents,
  tipCents,
  serviceCents,
  discountCents,
  tipMode,
  taxMode,
  partySize,
  taxIncluded,
  onSave,
  isSaving,
  saveError,
}: Props) {
  const initial = useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.claims.some((c) => c.participantId === myParticipantId))
          .map((i) => i.id)
      ),
    [items, myParticipantId]
  );

  const [selected, setSelected] = useState<Set<string>>(initial);
  const [dirty, setDirty] = useState(false);

  // Re-sync when the underlying bill changes (someone else claimed something).
  useEffect(() => {
    if (!dirty) setSelected(initial);
  }, [initial, dirty]);

  const nameById = useMemo(
    () => new Map(participants.map((p) => [p.id, p.displayName])),
    [participants]
  );

  // Project my pending selection onto the claim list so the running total
  // reflects what I'm about to save, not what's currently stored.
  const projectedItems = items.map((i) => {
    const others = i.claims.filter((c) => c.participantId !== myParticipantId);
    const mine = selected.has(i.id) ? [{ participantId: myParticipantId, shares: 1 }] : [];
    return { id: i.id, totalCents: i.totalCents, claims: [...others, ...mine] };
  });

  const math = computeSplit({
    items: projectedItems,
    participantIds: participants.map((p) => p.id),
    taxCents,
    tipCents,
    serviceCents,
    discountCents,
    tipMode,
    taxMode,
    partySize,
    taxIncluded,
  });

  const myShare = math.participants.find((p) => p.participantId === myParticipantId);
  const display = moneyDisplay({ currency, homeCurrency, effectiveFxRate });
  const converting = display.converting;
  const money = display.format;

  function toggle(itemId: string) {
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function save() {
    await onSave(Array.from(selected).map((itemId) => ({ itemId, shares: 1 })));
    setDirty(false);
  }

  // No bottom padding here: this list is not the last thing on the page (the
  // breakdown and settle-up cards follow it), so padding to clear the fixed bar
  // would open half a screen of dead space mid-page. The clearance belongs to
  // whatever renders last — see the claim tab in SplitDetail.
  return (
    <div className="flex flex-col gap-3">
      {converting && (
        <p className="text-xs text-default-400">
          Amounts are shown in {homeCurrency}; the receipt is in {currency}.
        </p>
      )}

      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-default-500">
          This bill doesn&apos;t have any line items yet.
        </p>
      )}

      {items.map((item) => {
        const isMine = selected.has(item.id);
        const others = item.claims.filter((c) => c.participantId !== myParticipantId);
        const shareCount = others.length + (isMine ? 1 : 0);

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            aria-pressed={isMine}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              isMine
                ? "border-primary bg-primary-50/50"
                : "border-divider bg-content1 hover:bg-content2"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  isMine ? "border-primary bg-primary text-white" : "border-default-300"
                }`}
              >
                {isMine && <Check className="h-3.5 w-3.5" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">
                    {item.quantity > 1 && (
                      <span className="text-default-500">{item.quantity}× </span>
                    )}
                    {item.label}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(item.totalCents)}</span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {shareCount > 1 && (
                    <Chip size="sm" variant="flat" color="primary">
                      split {shareCount} ways · {money(Math.round(item.totalCents / shareCount))}{" "}
                      each
                    </Chip>
                  )}
                  {others.map((c) => (
                    <Chip key={c.participantId} size="sm" variant="flat">
                      {nameById.get(c.participantId) ?? "Someone"}
                    </Chip>
                  ))}
                  {shareCount === 0 && <span className="text-xs text-default-400">nobody yet</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}

      {/* Running total, pinned so it stays visible while tapping through a long
          receipt on a phone. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <Card shadow="none" className="mx-auto max-w-2xl bg-transparent">
          <CardBody className="flex flex-row items-center justify-between gap-3 p-0">
            <div className="min-w-0">
              <p className="text-xs text-default-500">You owe</p>
              <p className="text-2xl font-bold tabular-nums">{money(myShare?.totalCents ?? 0)}</p>
              {myShare && myShare.itemsCents > 0 && (
                <p className="truncate text-xs text-default-500">
                  {money(myShare.itemsCents)} items
                  {!taxIncluded && myShare.taxCents + myShare.serviceCents !== 0
                    ? ` + ${money(myShare.taxCents + myShare.serviceCents)} tax`
                    : ""}
                  {myShare.tipCents !== 0 ? ` + ${money(myShare.tipCents)} tip` : ""}
                </p>
              )}
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
            </div>
            <Button
              color="primary"
              className="shrink-0"
              isDisabled={!dirty || isSaving}
              isLoading={isSaving}
              onPress={() => void save()}
            >
              {dirty ? "Save" : "Saved"}
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
