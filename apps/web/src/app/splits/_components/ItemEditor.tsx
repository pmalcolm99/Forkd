"use client";

import { Button, Input } from "@heroui/react";
import { Plus, Split, Trash2 } from "lucide-react";
import { expandItemQuantity, formatCents, isExpandable } from "@forkd/shared";
import { MoneyInput } from "./MoneyInput";

export interface DraftItem {
  key: string;
  label: string;
  quantity: number;
  totalCents: number;
}

interface Props {
  items: DraftItem[];
  currency: string;
  onChange: (items: DraftItem[]) => void;
  isDisabled?: boolean;
}

export function newDraftItem(): DraftItem {
  return { key: crypto.randomUUID(), label: "", quantity: 1, totalCents: 0 };
}

/**
 * Editable line-item table.
 *
 * OCR is never perfect, so this is the screen that decides whether the whole
 * feature is trustworthy: every field is editable, rows can be added and
 * removed, and the running subtotal is always visible.
 */
export function ItemEditor({ items, currency, onChange, isDisabled }: Props) {
  const subtotal = items.reduce((acc, i) => acc + i.totalCents, 0);

  function update(key: string, patch: Partial<DraftItem>) {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  /**
   * Turn "3× Schnitzel — 80.70" into three rows of 26.90 so each one can be
   * claimed by a different person. Prices are allocated (not divided) so they
   * still sum to the original line total exactly.
   */
  function splitRow(key: string) {
    onChange(
      items.flatMap((i) => {
        if (i.key !== key) return [i];
        return expandItemQuantity({
          label: i.label,
          quantity: i.quantity,
          unitPriceCents: null,
          totalCents: i.totalCents,
        }).map((part) => ({
          key: crypto.randomUUID(),
          label: part.label,
          quantity: 1,
          totalCents: part.totalCents,
        }));
      })
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-default-300 p-4 text-center text-sm text-default-500">
          No line items yet. Add them by hand, or scan a receipt photo.
        </p>
      )}

      {items.map((item) => (
        <div key={item.key} className="flex items-end gap-2">
          <Input
            aria-label="Item name"
            size="sm"
            placeholder="Item"
            className="flex-1"
            value={item.label}
            isDisabled={isDisabled}
            onValueChange={(v) => update(item.key, { label: v })}
          />
          <Input
            aria-label="Quantity"
            size="sm"
            className="w-16 shrink-0"
            inputMode="numeric"
            value={String(item.quantity)}
            isDisabled={isDisabled}
            onValueChange={(v) => {
              const n = Number(v);
              update(item.key, { quantity: Number.isFinite(n) && n > 0 ? n : 1 });
            }}
          />
          <MoneyInput
            aria-label="Line total"
            className="w-28 shrink-0"
            value={item.totalCents}
            currency={currency}
            isDisabled={isDisabled}
            onChange={(cents) => update(item.key, { totalCents: cents })}
          />
          {isExpandable(item) && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`Split ${item.label || "item"} into ${Math.round(item.quantity)} separate items`}
              title={`Split into ${Math.round(item.quantity)} separate items`}
              isDisabled={isDisabled}
              onPress={() => splitRow(item.key)}
            >
              <Split className="h-4 w-4" />
            </Button>
          )}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label={`Remove ${item.label || "item"}`}
            isDisabled={isDisabled}
            onPress={() => onChange(items.filter((i) => i.key !== item.key))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {items.some(isExpandable) && (
        <p className="text-xs text-default-500">
          Some rows cover more than one of the same thing. Use the split button to break them into
          separate items so each person can pick their own.
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button
          size="sm"
          variant="flat"
          startContent={<Plus className="h-4 w-4" />}
          isDisabled={isDisabled}
          onPress={() => onChange([...items, newDraftItem()])}
        >
          Add item
        </Button>
        <p className="text-sm text-default-500">
          Items total <span className="font-medium">{formatCents(subtotal, currency)}</span>
        </p>
      </div>
    </div>
  );
}
