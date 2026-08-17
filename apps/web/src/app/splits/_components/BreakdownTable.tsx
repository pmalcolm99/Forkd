"use client";

import { Chip } from "@heroui/react";
import { moneyDisplay, type SplitMathResult } from "@forkd/shared";

interface Props {
  math: SplitMathResult;
  participants: { id: string; displayName: string; paidAt: Date | string | null }[];
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  payerParticipantId?: string | null;
  highlightParticipantId?: string | null;
}

/**
 * Per-person breakdown: what you ordered, your share of tax/tip, the total.
 *
 * Two layouts. The table needs ~450px to stay readable, which overflows a phone,
 * so below `sm` each person becomes a stacked card instead — the same approach
 * the admin users table uses. Avoids a horizontally-scrolling table on the one
 * screen most people will open on their phone.
 */
export function BreakdownTable({
  math,
  participants,
  currency,
  homeCurrency,
  effectiveFxRate,
  payerParticipantId,
  highlightParticipantId,
}: Props) {
  const display = moneyDisplay({ currency, homeCurrency, effectiveFxRate });
  const converting = display.converting;
  const money = display.format;

  const byId = new Map(math.participants.map((p) => [p.participantId, p]));
  const rows = participants
    .map((p) => ({ person: p, share: byId.get(p.id) }))
    .filter(
      (r): r is { person: (typeof participants)[number]; share: NonNullable<typeof r.share> } =>
        Boolean(r.share)
    );

  const taxLabel = math.taxIncluded ? "Tax (included)" : "Tax";

  return (
    <div>
      {/* Mobile: one stacked card per person. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map(({ person, share }) => {
          const isMe = person.id === highlightParticipantId;
          return (
            <div
              key={person.id}
              className={`rounded-lg border p-3 ${
                isMe ? "border-primary bg-primary-50/40" : "border-divider bg-content2"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate ${isMe ? "font-semibold" : "font-medium"}`}>
                  {person.displayName}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{money(share.totalCents)}</span>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {person.id === payerParticipantId && (
                  <Chip size="sm" variant="flat" color="primary">
                    paid the bill
                  </Chip>
                )}
                {person.paidAt && (
                  <Chip size="sm" variant="flat" color="success">
                    settled up
                  </Chip>
                )}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-default-500">
                <dt>Items</dt>
                <dd className="text-right tabular-nums">{money(share.itemsCents)}</dd>
                {share.taxCents !== 0 && (
                  <>
                    <dt>{taxLabel}</dt>
                    <dd className="text-right tabular-nums">{money(share.taxCents)}</dd>
                  </>
                )}
                {share.serviceCents !== 0 && (
                  <>
                    <dt>Service</dt>
                    <dd className="text-right tabular-nums">{money(share.serviceCents)}</dd>
                  </>
                )}
                {share.discountCents !== 0 && (
                  <>
                    <dt>Discount</dt>
                    <dd className="text-right tabular-nums">−{money(share.discountCents)}</dd>
                  </>
                )}
                <dt>Tip{share.effectiveTipPct != null ? ` (${share.effectiveTipPct}%)` : ""}</dt>
                <dd className="text-right tabular-nums">{money(share.tipCents)}</dd>
              </dl>
            </div>
          );
        })}

        {math.unassigned.totalCents !== 0 && (
          <div className="rounded-lg border border-warning-300 bg-warning-50/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-warning-700">Unclaimed</span>
              <span className="shrink-0 font-bold tabular-nums text-warning-700">
                {money(math.unassigned.totalCents)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-warning-600">
              {math.unclaimedItemIds.length} item{math.unclaimedItemIds.length === 1 ? "" : "s"}{" "}
              nobody has picked
            </p>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2 border-t border-divider pt-2">
          <span className="font-medium">Total</span>
          <span className="font-bold tabular-nums">{money(math.grandTotalCents)}</span>
        </div>
      </div>

      {/* Desktop: full table. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider text-left text-xs uppercase text-default-500">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 text-right font-medium">Items</th>
              <th className="py-2 pr-3 text-right font-medium">Before tip</th>
              <th className="py-2 pr-3 text-right font-medium">Tip</th>
              <th className="py-2 text-right font-medium">Owes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, share }) => {
              const isMe = person.id === highlightParticipantId;
              return (
                <tr
                  key={person.id}
                  className={`border-b border-divider/60 ${isMe ? "bg-primary-50/40" : ""}`}
                >
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={isMe ? "font-semibold" : ""}>{person.displayName}</span>
                      {person.id === payerParticipantId && (
                        <Chip size="sm" variant="flat" color="primary">
                          paid the bill
                        </Chip>
                      )}
                      {person.paidAt && (
                        <Chip size="sm" variant="flat" color="success">
                          settled up
                        </Chip>
                      )}
                    </div>
                    {share.effectiveTipPct != null && (
                      <p className="text-xs text-default-400">{share.effectiveTipPct}% tip</p>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(share.itemsCents)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-default-500">
                    {money(share.preTipCents)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-default-500">
                    {money(share.tipCents)}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {money(share.totalCents)}
                  </td>
                </tr>
              );
            })}

            {math.unassigned.totalCents !== 0 && (
              <tr className="border-b border-divider/60 text-warning">
                <td className="py-2 pr-3">
                  Unclaimed
                  <p className="text-xs opacity-80">
                    {math.unclaimedItemIds.length} item
                    {math.unclaimedItemIds.length === 1 ? "" : "s"} nobody has picked
                  </p>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {money(math.unassigned.itemsCents)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {money(math.unassigned.preTipCents)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {money(math.unassigned.tipCents)}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {money(math.unassigned.totalCents)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 pr-3 font-medium">Total</td>
              <td colSpan={3} />
              <td className="py-2 text-right font-bold tabular-nums">
                {money(math.grandTotalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {math.taxIncluded && (
        <p className="mt-2 text-xs text-default-400">
          Tax was already included in the item prices, so it isn&apos;t added again.
        </p>
      )}
      {!math.balanced && (
        <p className="mt-2 text-sm text-danger">
          These shares don&apos;t add up to the total. That&apos;s a bug — please report it.
        </p>
      )}
      {converting && (
        <p className="mt-2 text-xs text-default-400">
          Shown in {homeCurrency}. Receipt is in {currency}.
        </p>
      )}
    </div>
  );
}
