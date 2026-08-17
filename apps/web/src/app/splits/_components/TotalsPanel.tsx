"use client";

import { Alert, Input, Select, SelectItem, Switch } from "@heroui/react";
import { formatCents, type SplitAllocation } from "@forkd/shared";
import { MoneyInput } from "./MoneyInput";

export interface TotalsDraft {
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  totalCents: number;
  tipMode: SplitAllocation;
  taxMode: SplitAllocation;
  partySize: number | null;
  taxIncluded: boolean;
}

interface Props {
  itemsSubtotalCents: number;
  currency: string;
  value: TotalsDraft;
  onChange: (patch: Partial<TotalsDraft>) => void;
  participantCount: number;
  isDisabled?: boolean;
}

export function TotalsPanel({
  itemsSubtotalCents,
  currency,
  value,
  onChange,
  participantCount,
  isDisabled,
}: Props) {
  const computed =
    itemsSubtotalCents +
    (value.taxIncluded ? 0 : value.taxCents) +
    value.tipCents +
    value.serviceCents -
    value.discountCents;
  const mismatch = value.totalCents - computed;
  const needsPartySize = value.tipMode === "even" || value.taxMode === "even";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyInput
          label="Tax"
          value={value.taxCents}
          currency={currency}
          isDisabled={isDisabled}
          onChange={(c) => onChange({ taxCents: c })}
        />
        <MoneyInput
          label="Tip"
          value={value.tipCents}
          currency={currency}
          isDisabled={isDisabled}
          onChange={(c) => onChange({ tipCents: c })}
        />
        <MoneyInput
          label="Service"
          value={value.serviceCents}
          currency={currency}
          isDisabled={isDisabled}
          onChange={(c) => onChange({ serviceCents: c })}
        />
        <MoneyInput
          label="Discount"
          value={value.discountCents}
          currency={currency}
          isDisabled={isDisabled}
          onChange={(c) => onChange({ discountCents: c })}
        />
        <MoneyInput
          label="Receipt total"
          value={value.totalCents}
          currency={currency}
          isDisabled={isDisabled}
          onChange={(c) => onChange({ totalCents: c })}
        />
      </div>

      {value.taxCents > 0 && (
        <Switch
          size="sm"
          isSelected={value.taxIncluded}
          isDisabled={isDisabled}
          onValueChange={(v) => onChange({ taxIncluded: v })}
        >
          <span className="text-sm">
            Tax is already included in the item prices
            <span className="block text-xs text-default-500">
              Normal outside the US — a VAT / MwSt / IVA / GST line breaks down the total rather
              than adding to it. Leave this on and the tax is shown but not charged again.
            </span>
          </span>
        </Switch>
      )}

      {mismatch !== 0 && (
        <Alert color="warning" className="text-sm">
          The line items plus tax and tip come to <strong>{formatCents(computed, currency)}</strong>
          , but the receipt total says <strong>{formatCents(value.totalCents, currency)}</strong> —
          a difference of <strong>{formatCents(Math.abs(mismatch), currency)}</strong>. Usually that
          means a line item was misread. Check the items before sharing.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Split the tip"
          size="sm"
          isDisabled={isDisabled}
          selectedKeys={new Set([value.tipMode])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as SplitAllocation;
            if (v) onChange({ tipMode: v });
          }}
        >
          <SelectItem key="proportional" description="Based on what each person ordered">
            Proportionally
          </SelectItem>
          <SelectItem key="even" description="Same amount each">
            Evenly
          </SelectItem>
        </Select>

        <Select
          label="Split tax, service & discount"
          size="sm"
          isDisabled={isDisabled}
          selectedKeys={new Set([value.taxMode])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as SplitAllocation;
            if (v) onChange({ taxMode: v });
          }}
        >
          <SelectItem key="proportional" description="Based on what each person ordered">
            Proportionally
          </SelectItem>
          <SelectItem key="even" description="Same amount each">
            Evenly
          </SelectItem>
        </Select>
      </div>

      {needsPartySize && (
        <div className="flex items-center gap-3">
          <Input
            aria-label="Number of people"
            label="How many people?"
            size="sm"
            inputMode="numeric"
            className="w-40 shrink-0"
            isDisabled={isDisabled}
            value={String(value.partySize ?? participantCount)}
            onValueChange={(v) => {
              const n = Number(v);
              onChange({ partySize: Number.isFinite(n) && n > 0 ? Math.round(n) : null });
            }}
          />
          <p className="text-xs text-default-500">
            Anything belonging to seats you haven&apos;t added yet is held back as unassigned rather
            than loaded onto the people who are already here.
          </p>
        </div>
      )}
    </div>
  );
}
