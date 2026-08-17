"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import { Check } from "lucide-react";
import { formatCents } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { BreakdownTable } from "./BreakdownTable";
import { ClaimBoard } from "./ClaimBoard";

/** The family share link (/s/<token>) — signed-in Forkd users only. */
export function ShareClaimPage({ token }: { token: string }) {
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);

  const query = trpc.splits.getByShareToken.useQuery({ token });
  const split = query.data;

  const refresh = () => void utils.splits.getByShareToken.invalidate({ token });

  const joinAsSelf = trpc.splits.joinAsSelf.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });
  const setClaims = trpc.splits.setClaims.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });
  const setPaid = trpc.splits.setPaid.useMutation({ onSuccess: refresh });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (query.error || !split) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <Alert color="danger">
          {query.error?.message ?? "This bill link isn't active any more."}
        </Alert>
        <Button as={Link} href="/splits" variant="flat" className="mt-4">
          Go to my bills
        </Button>
      </main>
    );
  }

  const me = split.participants.find((p) => p.id === split.myParticipantId) ?? null;
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

      {error && (
        <Alert color="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!me ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="font-medium">Which of these is you?</p>
            <p className="text-sm text-default-500">
              Add yourself to this bill and then pick the things you ordered.
            </p>
            <Button
              color="primary"
              isLoading={joinAsSelf.isPending}
              onPress={() => joinAsSelf.mutate({ id: split.id })}
            >
              That&apos;s me — add me
            </Button>
            {split.participants.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                {split.participants.map((p) => (
                  <Chip key={p.id} size="sm" variant="flat">
                    {p.displayName}
                  </Chip>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-default-500">
            Picking as <strong>{me.displayName}</strong> — tap everything you ordered. Tap something
            someone else already picked to split it with them.
          </p>

          <ClaimBoard
            items={split.items}
            participants={split.participants}
            myParticipantId={me.id}
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
            isSaving={setClaims.isPending}
            saveError={setClaims.error?.message ?? null}
            onSave={async (claims) => {
              await setClaims.mutateAsync({
                splitId: split.id,
                participantId: me.id,
                claims,
              });
            }}
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
                  <Button
                    size="sm"
                    color={me.paidAt ? "success" : "primary"}
                    variant={me.paidAt ? "flat" : "solid"}
                    startContent={me.paidAt ? <Check className="h-4 w-4" /> : undefined}
                    onPress={() => setPaid.mutate({ participantId: me.id, paid: !me.paidAt })}
                  >
                    {me.paidAt ? "Marked as paid" : "I've paid"}
                  </Button>
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
                highlightParticipantId={me.id}
              />
              <p className="mt-3 text-xs text-default-400">
                Receipt total {formatCents(split.totalCents, split.currency)}
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </main>
  );
}
