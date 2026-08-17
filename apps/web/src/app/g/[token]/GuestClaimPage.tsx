"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Card, CardBody, Spinner } from "@heroui/react";
import { Check } from "lucide-react";
import { Button } from "@heroui/react";
import { formatCents, type SplitMathResult } from "@forkd/shared";
import { BreakdownTable } from "@/app/splits/_components/BreakdownTable";
import { ClaimBoard } from "@/app/splits/_components/ClaimBoard";

/**
 * Shape of /api/v1/guest/split. Narrower than the in-app view: no creator
 * identity, no family share token, and no email addresses anywhere.
 */
interface GuestSplit {
  id: string;
  title: string;
  merchantName: string | null;
  restaurant: { id: string; name: string } | null;
  purchasedAt: string | null;
  paidByParticipantId: string | null;
  currency: string;
  homeCurrency: string;
  effectiveFxRate: number | null;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  totalCents: number;
  tipMode: "proportional" | "even";
  taxMode: "proportional" | "even";
  partySize: number | null;
  taxIncluded: boolean;
  items: {
    id: string;
    label: string;
    quantity: number;
    totalCents: number;
    claims: { participantId: string; shares: number }[];
  }[];
  participants: {
    id: string;
    displayName: string;
    paidAt: string | null;
    payment: {
      venmoHandle: string | null;
      cashAppHandle: string | null;
      paymentNote: string | null;
    } | null;
  }[];
  math: SplitMathResult;
  myParticipantId: string;
  myDisplayName: string;
}

export function GuestClaimPage({ token }: { token: string }) {
  const [split, setSplit] = useState<GuestSplit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/guest/split?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(
          "This link isn't active. It may have expired, been turned off, or the bill was deleted."
        );
        return;
      }
      setSplit((await res.json()) as GuestSplit);
      setError(null);
    } catch {
      setError("Couldn't load this bill. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveClaims(claims: { itemId: string; shares: number }[]) {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/guest/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, claims }),
      });
      if (!res.ok) throw new Error("Could not save your picks.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your picks.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePaid(paid: boolean) {
    await fetch("/api/v1/guest/paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, paid }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !split) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <Alert color="danger">{error ?? "This link isn't active."}</Alert>
      </main>
    );
  }

  const me = split.participants.find((p) => p.id === split.myParticipantId);
  const payer = split.participants.find((p) => p.id === split.paidByParticipantId);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-balance break-words text-xl font-bold sm:text-2xl">{split.title}</h1>
        <p className="break-words text-sm text-default-500">
          {[
            split.merchantName ?? split.restaurant?.name,
            split.purchasedAt ? new Date(split.purchasedAt).toLocaleDateString() : null,
            payer ? `paid by ${payer.displayName}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <p className="mb-3 text-sm text-default-500">
        Hi {split.myDisplayName} — tap everything you ordered. Tap something someone else already
        picked to split it with them.
      </p>

      <ClaimBoard
        items={split.items}
        participants={split.participants}
        myParticipantId={split.myParticipantId}
        currency={split.currency}
        homeCurrency={split.homeCurrency}
        effectiveFxRate={split.effectiveFxRate}
        taxCents={split.taxCents}
        tipCents={split.tipCents}
        serviceCents={split.serviceCents}
        discountCents={split.discountCents}
        tipMode={split.tipMode}
        taxMode={split.taxMode}
        partySize={split.partySize}
        taxIncluded={split.taxIncluded}
        isSaving={saving}
        onSave={saveClaims}
      />

      {payer && (
        <Card className="mb-4">
          <CardBody className="flex flex-col gap-3 p-4">
            <p className="font-medium">Paying {payer.displayName} back</p>
            <div className="flex flex-wrap gap-2">
              {payer.payment?.venmoHandle && (
                <Button
                  as="a"
                  size="sm"
                  variant="flat"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://venmo.com/u/${encodeURIComponent(payer.payment.venmoHandle)}`}
                >
                  Venmo @{payer.payment.venmoHandle}
                </Button>
              )}
              {payer.payment?.cashAppHandle && (
                <Button
                  as="a"
                  size="sm"
                  variant="flat"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://cash.app/$${encodeURIComponent(payer.payment.cashAppHandle.replace(/^\$/, ""))}`}
                >
                  Cash App ${payer.payment.cashAppHandle.replace(/^\$/, "")}
                </Button>
              )}
              {me && (
                <Button
                  size="sm"
                  color={me.paidAt ? "success" : "primary"}
                  variant={me.paidAt ? "flat" : "solid"}
                  startContent={me.paidAt ? <Check className="h-4 w-4" /> : undefined}
                  onPress={() => void togglePaid(!me.paidAt)}
                >
                  {me.paidAt ? "Marked as paid" : "I've paid"}
                </Button>
              )}
            </div>
            {payer.payment?.paymentNote && (
              <p className="text-sm text-default-500">{payer.payment.paymentNote}</p>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardBody className="p-4">
          <p className="mb-3 font-medium">Everyone&apos;s share</p>
          <BreakdownTable
            math={split.math}
            participants={split.participants}
            currency={split.currency}
            homeCurrency={split.homeCurrency}
            effectiveFxRate={split.effectiveFxRate}
            payerParticipantId={split.paidByParticipantId}
            highlightParticipantId={split.myParticipantId}
          />
          <p className="mt-3 text-xs text-default-400">
            Receipt total {formatCents(split.totalCents, split.currency)}
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
