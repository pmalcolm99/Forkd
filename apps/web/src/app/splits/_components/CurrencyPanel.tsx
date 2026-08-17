"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Input,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  CURRENCIES,
  canAutoConvert,
  formatCents,
  getCurrencyName,
  type SplitFxMode,
} from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { MoneyInput } from "./MoneyInput";

interface Props {
  currency: string;
  homeCurrency: string;
  fxMode: SplitFxMode;
  fxRate: number | null;
  statementTotalCents: number | null;
  receiptTotalCents: number;
  purchasedAt: Date | string | null;
  onChange: (patch: {
    currency?: string;
    fxMode?: SplitFxMode;
    fxRate?: number | null;
    statementTotalCents?: number | null;
  }) => void;
  isDisabled?: boolean;
}

/**
 * Currency + conversion controls. Only meaningful when the receipt is in a
 * different currency from the family's own, so it collapses to a single
 * selector otherwise.
 */
export function CurrencyPanel({
  currency,
  homeCurrency,
  fxMode,
  fxRate,
  statementTotalCents,
  receiptTotalCents,
  purchasedAt,
  onChange,
  isDisabled,
}: Props) {
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const foreign = currency !== homeCurrency;
  const autoAvailable = canAutoConvert(currency, homeCurrency);

  const utils = trpc.useUtils();

  async function fetchRate() {
    setLookupNote(null);
    const date = purchasedAt ? new Date(purchasedAt).toISOString().slice(0, 10) : null;
    const res = await utils.client.splits.fxRate.query({ from: currency, to: homeCurrency, date });
    if (res.rate == null) {
      setLookupNote(
        `Couldn't fetch a rate for ${currency} → ${homeCurrency}. Enter it by hand, or use your statement total.`
      );
      return;
    }
    onChange({ fxMode: "rate", fxRate: res.rate });
    setLookupNote(
      res.date ? `Using the published rate for ${res.date}.` : "Using the latest published rate."
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-4">
        <Select
          label="Currency on the receipt"
          size="sm"
          isDisabled={isDisabled}
          selectedKeys={new Set([currency])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string;
            if (!v) return;
            onChange({ currency: v, ...(v === homeCurrency ? { fxMode: "none" } : {}) });
          }}
        >
          {CURRENCIES.map((c) => (
            <SelectItem key={c.code} textValue={`${c.code} — ${c.name}`}>
              {c.code} — {c.name}
            </SelectItem>
          ))}
        </Select>

        {foreign && (
          <>
            <Alert color="primary" className="text-sm">
              This receipt is in {getCurrencyName(currency)}. How should Forkd show it in{" "}
              {homeCurrency}?
            </Alert>

            <RadioGroup
              size="sm"
              isDisabled={isDisabled}
              value={fxMode}
              onValueChange={(v) => onChange({ fxMode: v as SplitFxMode })}
            >
              <Radio
                value="statement"
                description="Most accurate — this already includes your card's exchange markup and any foreign transaction fee, so the split matches your statement exactly."
              >
                Enter the total from my bank statement
              </Radio>
              <Radio value="rate" description="Uses the published mid-market rate for the day.">
                Use a conversion rate
              </Radio>
              <Radio value="none" description="Show everything in the receipt's own currency.">
                Don&apos;t convert
              </Radio>
            </RadioGroup>

            {fxMode === "statement" && (
              <div className="flex flex-wrap items-end gap-3">
                <MoneyInput
                  label={`Total charged in ${homeCurrency}`}
                  currency={homeCurrency}
                  value={statementTotalCents ?? 0}
                  isDisabled={isDisabled}
                  onChange={(c) => onChange({ statementTotalCents: c })}
                  className="w-48"
                />
                {statementTotalCents && receiptTotalCents > 0 ? (
                  <p className="text-xs text-default-500">
                    Effective rate {(statementTotalCents / receiptTotalCents).toFixed(4)}{" "}
                    {homeCurrency} per {currency}
                  </p>
                ) : null}
              </div>
            )}

            {fxMode === "rate" && (
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label={`${homeCurrency} per 1 ${currency}`}
                  size="sm"
                  inputMode="decimal"
                  className="w-48"
                  isDisabled={isDisabled}
                  value={fxRate == null ? "" : String(fxRate)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    onChange({ fxRate: Number.isFinite(n) && n > 0 ? n : null });
                  }}
                />
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={isDisabled || !autoAvailable}
                  onPress={() => void fetchRate()}
                >
                  Look up rate
                </Button>
                {!autoAvailable && (
                  <p className="text-xs text-default-500">
                    No published rate for this pair — enter it by hand.
                  </p>
                )}
              </div>
            )}

            {lookupNote && <p className="text-xs text-default-500">{lookupNote}</p>}

            {fxMode !== "none" && receiptTotalCents > 0 && (
              <p className="text-sm text-default-500">
                {formatCents(receiptTotalCents, currency)} ≈{" "}
                {fxMode === "statement" && statementTotalCents
                  ? formatCents(statementTotalCents, homeCurrency)
                  : fxRate
                    ? formatCents(Math.round(receiptTotalCents * fxRate), homeCurrency)
                    : "—"}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
