"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Switch,
  Tab,
  Tabs,
} from "@heroui/react";
import { Check, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { TERMINAL_AI_STATUSES, formatCents } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { receiptUrl } from "@/lib/receiptUrl";
import { buildSplitSummary } from "@/lib/splitSummary";
import { BreakdownTable } from "./BreakdownTable";
import { ClaimBoard } from "./ClaimBoard";
import { CurrencyPanel } from "./CurrencyPanel";
import { ItemEditor, newDraftItem, type DraftItem } from "./ItemEditor";
import { PeoplePanel } from "./PeoplePanel";
import { ReceiptUpload } from "./ReceiptUpload";
import { SharePanel } from "./SharePanel";
import { TotalsPanel, type TotalsDraft } from "./TotalsPanel";

export function SplitDetail({ splitId, justScanned }: { splitId: string; justScanned?: boolean }) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const query = trpc.splits.get.useQuery(
    { id: splitId },
    {
      refetchInterval: (q) => {
        const s = q.state.data?.aiStatus;
        return s && TERMINAL_AI_STATUSES.has(s) ? false : 2000;
      },
    }
  );
  const split = query.data;

  const [tab, setTab] = useState<string>("claim");
  const [draftItems, setDraftItems] = useState<DraftItem[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  // A freshly scanned bill needs checking before anyone claims anything.
  useEffect(() => {
    if (justScanned) setTab("items");
  }, [justScanned]);

  const refresh = () => {
    void utils.splits.get.invalidate({ id: splitId });
    void utils.splits.list.invalidate();
    router.refresh();
  };

  const update = trpc.splits.update.useMutation({
    onSuccess: refresh,
    onError: (e) => setSaveError(e.message),
  });
  const replaceItems = trpc.splits.replaceItems.useMutation({
    onSuccess: () => {
      setDraftItems(null);
      refresh();
    },
    onError: (e) => setSaveError(e.message),
  });
  const setClaims = trpc.splits.setClaims.useMutation({
    onSuccess: refresh,
    onError: (e) => setSaveError(e.message),
  });
  const setPaid = trpc.splits.setPaid.useMutation({ onSuccess: refresh });
  const setShareEnabled = trpc.splits.setShareEnabled.useMutation({
    onSuccess: refresh,
    onError: (e) => setSaveError(e.message),
  });
  const joinAsSelf = trpc.splits.joinAsSelf.useMutation({ onSuccess: refresh });
  const extract = trpc.splits.extract.useMutation({
    onSuccess: refresh,
    onError: (e) => setSaveError(e.message),
  });
  const deleteSplit = trpc.splits.delete.useMutation({
    onSuccess: () => {
      void utils.splits.list.invalidate();
      router.push("/splits");
    },
  });

  const summary = useMemo(() => {
    if (!split) return "";
    const payer = split.participants.find((p) => p.id === split.paidByParticipantId);
    return buildSplitSummary({
      title: split.title,
      merchantName: split.merchantName,
      currency: split.currency,
      homeCurrency: split.homeCurrency,
      effectiveFxRate: split.effectiveFxRate,
      totalCents: split.totalCents,
      participants: split.participants,
      math: split.math,
      payerName: payer?.displayName ?? null,
      shareUrl: split.shareToken && origin ? `${origin}/s/${split.shareToken}` : null,
    });
  }, [split, origin]);

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
        <Alert color="danger">{query.error?.message ?? "Bill not found."}</Alert>
      </main>
    );
  }

  const myParticipant = split.participants.find((p) => p.id === split.myParticipantId) ?? null;
  const scanning = split.aiStatus === "queued" || split.aiStatus === "processing";
  const payer = split.participants.find((p) => p.id === split.paidByParticipantId);

  const totals: TotalsDraft = {
    taxCents: split.taxCents,
    taxIncluded: split.taxIncluded,
    tipCents: split.tipCents,
    serviceCents: split.serviceCents,
    discountCents: split.discountCents,
    totalCents: split.totalCents,
    tipMode: split.tipMode,
    taxMode: split.taxMode,
    partySize: split.partySize,
  };

  const items =
    draftItems ??
    split.items.map((i) => ({
      key: i.id,
      label: i.label,
      quantity: i.quantity,
      totalCents: i.totalCents,
    }));

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <Button as={Link} href="/splits" variant="light" size="sm" className="-ml-2 mb-4">
        ← All bills
      </Button>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{split.title}</h1>
          <p className="text-sm text-default-500">
            {[
              split.merchantName ?? split.restaurant?.name,
              split.purchasedAt ? new Date(split.purchasedAt).toLocaleDateString() : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold tabular-nums">
            {formatCents(split.totalCents, split.currency)}
          </p>
          {split.effectiveFxRate != null && split.currency !== split.homeCurrency && (
            <p className="text-xs text-default-500">
              ≈{" "}
              {formatCents(
                Math.round(split.totalCents * split.effectiveFxRate),
                split.homeCurrency
              )}
            </p>
          )}
        </div>
      </div>

      {scanning && (
        <Alert color="primary" className="mb-4">
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            Reading the receipt — the items will appear here when it&apos;s done.
          </div>
        </Alert>
      )}

      {split.aiStatus === "failed" && (
        <Alert color="danger" className="mb-4">
          <p>{split.aiError ?? "The receipt scan failed."}</p>
          <p className="mt-1 text-xs">
            You can try again, or enter the items by hand on the Items tab.
          </p>
        </Alert>
      )}

      {split.totalMismatchCents !== 0 && split.items.length > 0 && (
        <Alert color="warning" className="mb-4 text-sm">
          The items don&apos;t add up to the receipt total — off by{" "}
          <strong>{formatCents(Math.abs(split.totalMismatchCents), split.currency)}</strong>. Check
          the Items tab before sharing.
        </Alert>
      )}

      {saveError && (
        <Alert color="danger" className="mb-4">
          {saveError}
        </Alert>
      )}

      <Tabs
        aria-label="Bill sections"
        selectedKey={tab}
        onSelectionChange={(k) => setTab(String(k))}
        className="mb-4"
      >
        <Tab key="claim" title="Claim" />
        <Tab key="items" title="Items" />
        <Tab key="people" title="People" />
        <Tab key="share" title="Share" />
      </Tabs>

      {tab === "claim" && (
        <div className="flex flex-col gap-4">
          {myParticipant ? (
            <ClaimBoard
              items={split.items}
              participants={split.participants}
              myParticipantId={myParticipant.id}
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
                  splitId,
                  participantId: myParticipant.id,
                  claims,
                });
              }}
            />
          ) : (
            <Card>
              <CardBody className="flex flex-col items-center gap-3 p-8 text-center">
                <p className="text-sm text-default-500">You&apos;re not on this bill yet.</p>
                <Button color="primary" onPress={() => joinAsSelf.mutate({ id: splitId })}>
                  Add me
                </Button>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody className="p-4">
              <p className="mb-3 font-medium">Everyone&apos;s share</p>
              <BreakdownTable
                math={split.math}
                participants={split.participants}
                currency={split.currency}
                homeCurrency={split.homeCurrency}
                effectiveFxRate={split.effectiveFxRate}
                payerParticipantId={split.paidByParticipantId}
                highlightParticipantId={myParticipant?.id ?? null}
              />
            </CardBody>
          </Card>

          {payer && (
            <Card>
              <CardBody className="flex flex-col gap-3 p-4">
                <p className="font-medium">Settling up with {payer.displayName}</p>
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
                  {myParticipant && (
                    <Button
                      size="sm"
                      color={myParticipant.paidAt ? "success" : "primary"}
                      variant={myParticipant.paidAt ? "flat" : "solid"}
                      startContent={
                        myParticipant.paidAt ? <Check className="h-4 w-4" /> : undefined
                      }
                      onPress={() =>
                        setPaid.mutate({
                          participantId: myParticipant.id,
                          paid: !myParticipant.paidAt,
                        })
                      }
                    >
                      {myParticipant.paidAt ? "Marked as paid" : "I've paid"}
                    </Button>
                  )}
                </div>
                {payer.payment?.paymentNote && (
                  <p className="text-sm text-default-500">{payer.payment.paymentNote}</p>
                )}
                {!payer.payment?.venmoHandle && !payer.payment?.cashAppHandle && (
                  <p className="text-xs text-default-400">
                    {payer.displayName} hasn&apos;t added payment details — they can add them in
                    Profile.
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === "items" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardBody className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Line items</p>
                {split.canEdit && (
                  <div className="flex gap-2">
                    {split.images.length > 0 && (
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<RefreshCw className="h-4 w-4" />}
                        isDisabled={scanning || extract.isPending}
                        onPress={() => extract.mutate({ id: splitId })}
                      >
                        Scan again
                      </Button>
                    )}
                    {draftItems ? (
                      <>
                        <Button size="sm" variant="light" onPress={() => setDraftItems(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          isLoading={replaceItems.isPending}
                          onPress={() =>
                            replaceItems.mutate({
                              splitId,
                              items: draftItems
                                .filter((i) => i.label.trim())
                                .map((i) => ({
                                  label: i.label.trim(),
                                  quantity: i.quantity,
                                  totalCents: i.totalCents,
                                  unitPriceCents: null,
                                  notes: null,
                                })),
                            })
                          }
                        >
                          Save items
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="flat"
                        startContent={<Pencil className="h-4 w-4" />}
                        onPress={() =>
                          setDraftItems(
                            split.items.length > 0
                              ? split.items.map((i) => ({
                                  key: i.id,
                                  label: i.label,
                                  quantity: i.quantity,
                                  totalCents: i.totalCents,
                                }))
                              : [newDraftItem()]
                          )
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {draftItems ? (
                <ItemEditor
                  items={items}
                  currency={split.currency}
                  onChange={setDraftItems}
                  isDisabled={replaceItems.isPending}
                />
              ) : split.items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <p className="text-sm text-default-500">No line items yet.</p>
                  {split.canEdit && (
                    <div className="flex gap-2">
                      {split.images.length > 0 && (
                        <Button
                          size="sm"
                          color="primary"
                          startContent={<Sparkles className="h-4 w-4" />}
                          isDisabled={scanning}
                          onPress={() => extract.mutate({ id: splitId })}
                        >
                          Read the receipt
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setDraftItems([newDraftItem()])}
                      >
                        Add by hand
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {split.items.map((i) => (
                    <div key={i.id} className="flex justify-between gap-3 py-1 text-sm">
                      <span className="min-w-0 truncate">
                        {i.quantity > 1 && <span className="text-default-500">{i.quantity}× </span>}
                        {i.label}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCents(i.totalCents, split.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {split.canEdit && (
            <>
              <Card>
                <CardBody className="flex flex-col gap-4 p-4">
                  <p className="font-medium">Tax, tip and totals</p>
                  <TotalsPanel
                    itemsSubtotalCents={split.items.reduce((a, i) => a + i.totalCents, 0)}
                    currency={split.currency}
                    value={totals}
                    participantCount={split.participants.length}
                    onChange={(patch) => update.mutate({ id: splitId, ...patch })}
                  />
                </CardBody>
              </Card>

              <CurrencyPanel
                currency={split.currency}
                homeCurrency={split.homeCurrency}
                fxMode={split.fxMode}
                fxRate={split.fxRate}
                statementTotalCents={split.statementTotalCents}
                receiptTotalCents={split.totalCents}
                purchasedAt={split.purchasedAt}
                onChange={(patch) => update.mutate({ id: splitId, ...patch })}
              />

              <Card>
                <CardBody className="flex flex-col gap-3 p-4">
                  <p className="font-medium">Receipt photos</p>
                  <ReceiptUpload splitId={splitId} images={split.images} onUploaded={refresh} />
                  {split.images.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {split.images.map((img) => (
                          <a
                            key={img.id}
                            href={receiptUrl(splitId, img.id, "full")}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary underline"
                          >
                            Open full size
                          </a>
                        ))}
                      </div>
                      <Switch
                        size="sm"
                        isSelected={split.hideImagesFromOthers}
                        onValueChange={(v) =>
                          update.mutate({ id: splitId, hideImagesFromOthers: v })
                        }
                      >
                        <span className="text-sm">
                          Hide the photos from everyone else
                          <span className="block text-xs text-default-500">
                            Receipts often print the last four digits of a card. Others still see
                            the itemized list.
                          </span>
                        </span>
                      </Switch>
                    </>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="flex flex-col gap-3 p-4">
                  <p className="font-medium">Details</p>
                  <Input
                    label="Name"
                    size="sm"
                    defaultValue={split.title}
                    onBlur={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v && v !== split.title) update.mutate({ id: splitId, title: v });
                    }}
                  />
                  <Input
                    label="Restaurant on the receipt"
                    size="sm"
                    defaultValue={split.merchantName ?? ""}
                    onBlur={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v !== (split.merchantName ?? ""))
                        update.mutate({ id: splitId, merchantName: v || null });
                    }}
                  />
                  <Button
                    color="danger"
                    variant="flat"
                    size="sm"
                    startContent={<Trash2 className="h-4 w-4" />}
                    className="self-start"
                    onPress={() => setConfirmDelete(true)}
                  >
                    Delete this bill
                  </Button>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "people" && (
        <PeoplePanel
          splitId={splitId}
          participants={split.participants}
          payerParticipantId={split.paidByParticipantId}
          canEdit={split.canEdit}
          onChanged={refresh}
        />
      )}

      {tab === "share" && (
        <div className="flex flex-col gap-4">
          <SharePanel
            shareToken={split.shareToken}
            shareEnabled={split.shareEnabled}
            summaryText={summary}
            title={split.title}
            canEdit={split.canEdit}
            onToggleShare={(enabled) => setShareEnabled.mutate({ id: splitId, enabled })}
          />
          <Card>
            <CardBody className="p-4">
              <p className="mb-3 font-medium">Who still owes</p>
              <div className="flex flex-col gap-2">
                {split.participants.map((p) => {
                  const share = split.math.participants.find((m) => m.participantId === p.id);
                  if (!share || share.totalCents === 0) return null;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {p.displayName}
                        {p.paidAt && (
                          <Chip size="sm" color="success" variant="flat">
                            paid
                          </Chip>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {formatCents(share.totalCents, split.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <ModalContent>
          <ModalHeader>Delete this bill?</ModalHeader>
          <ModalBody>
            <p className="text-sm">
              This removes the bill, everyone&apos;s picks, and the receipt photos from the server.
              It can&apos;t be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={deleteSplit.isPending}
              onPress={() => deleteSplit.mutate({ id: splitId })}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </main>
  );
}
