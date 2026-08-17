"use client";

import { useEffect, useState } from "react";
import { Input } from "@heroui/react";
import { centsToMoneyString, getCurrency, moneyStringToCents } from "@forkd/shared";

interface Props {
  label?: string;
  value: number;
  currency: string;
  onChange: (cents: number) => void;
  isDisabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-label"?: string;
}

/**
 * Money field that edits integer cents but lets people type naturally.
 *
 * Keeps its own draft string so a half-typed "12." isn't parsed and snapped
 * back mid-keystroke; commits on blur, and re-syncs when the value changes from
 * outside (e.g. after an AI re-scan).
 */
export function MoneyInput({
  label,
  value,
  currency,
  onChange,
  isDisabled,
  size = "sm",
  className,
  ...rest
}: Props) {
  const [draft, setDraft] = useState(() => centsToMoneyString(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(centsToMoneyString(value));
  }, [value, focused]);

  const symbol = getCurrency(currency)?.symbol ?? currency;

  function commit(raw: string) {
    const cents = moneyStringToCents(raw);
    if (cents == null) {
      setDraft(centsToMoneyString(value));
      return;
    }
    onChange(cents);
    setDraft(centsToMoneyString(cents));
  }

  return (
    <Input
      aria-label={rest["aria-label"] ?? label}
      label={label}
      size={size}
      className={className}
      isDisabled={isDisabled}
      value={draft}
      inputMode="decimal"
      startContent={<span className="text-xs text-default-400">{symbol}</span>}
      onValueChange={setDraft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
