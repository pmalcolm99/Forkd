"use client";

import { useState } from "react";
import { Alert, Button, Card, CardBody, Chip, Input, Select, SelectItem } from "@heroui/react";
import { Copy, Link2, Trash2, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface Participant {
  id: string;
  userId: string | null;
  displayName: string;
  isGuest: boolean;
  hasGuestLink: boolean;
}

interface Props {
  splitId: string;
  participants: Participant[];
  payerParticipantId: string | null;
  canEdit: boolean;
  onChanged: () => void;
}

export function PeoplePanel({
  splitId,
  participants,
  payerParticipantId,
  canEdit,
  onChanged,
}: Props) {
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guestLink, setGuestLink] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const users = trpc.users.listForFilter.useQuery();
  const guestEnabled = trpc.splits.guestLinksEnabled.useQuery();

  const addParticipant = trpc.splits.addParticipant.useMutation({
    onSuccess: () => {
      setGuestName("");
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e.message),
  });
  const removeParticipant = trpc.splits.removeParticipant.useMutation({
    onSuccess: onChanged,
    onError: (e) => setError(e.message),
  });
  const updateSplit = trpc.splits.update.useMutation({ onSuccess: onChanged });
  const mintGuestLink = trpc.splits.mintGuestLink.useMutation({
    onSuccess: (res, vars) => {
      setCopied(false);
      setGuestLink({
        id: vars.participantId,
        url: `${window.location.origin}/g/${res.token}`,
      });
      onChanged();
    },
    onError: (e) => setError(e.message),
  });
  const revokeGuestLink = trpc.splits.revokeGuestLink.useMutation({
    onSuccess: () => {
      setGuestLink(null);
      onChanged();
    },
  });

  const alreadyAdded = new Set(participants.map((p) => p.userId).filter(Boolean));
  const available = (users.data ?? []).filter((u) => !alreadyAdded.has(u.id));

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-4">
        <div>
          <p className="font-medium">Who was there?</p>
          <p className="text-sm text-default-500">
            Add everyone at the table. They pick their own items from the share link.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {participants.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-content2 px-3 py-2"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate">{p.displayName}</span>
                {p.isGuest && (
                  <Chip size="sm" variant="flat">
                    guest
                  </Chip>
                )}
                {p.id === payerParticipantId && (
                  <Chip size="sm" variant="flat" color="primary">
                    paid
                  </Chip>
                )}
                {p.hasGuestLink && (
                  <Chip size="sm" variant="flat" color="secondary">
                    has link
                  </Chip>
                )}
              </div>

              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  {p.isGuest && guestEnabled.data?.enabled && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label={p.hasGuestLink ? "Revoke guest link" : "Create guest link"}
                      title={p.hasGuestLink ? "Revoke guest link" : "Create guest link"}
                      onPress={() =>
                        p.hasGuestLink
                          ? revokeGuestLink.mutate({ participantId: p.id })
                          : mintGuestLink.mutate({ participantId: p.id })
                      }
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Remove ${p.displayName}`}
                    onPress={() => removeParticipant.mutate({ id: p.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {guestLink && (
          // HeroUI's Alert gives its content wrapper `flex-grow` but no
          // `min-w-0`, and a flex item defaults to min-width:auto — so a long
          // unbroken URL inside refuses to shrink, pushes the alert wider than
          // the card, and makes the whole page scroll sideways with the copy
          // button off-screen. min-w-0 on both slots lets `truncate` work.
          <Alert
            color="success"
            className="text-sm"
            classNames={{ base: "min-w-0", mainWrapper: "min-w-0" }}
          >
            <div className="flex w-full min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs">{guestLink.url}</code>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                className="shrink-0"
                aria-label="Copy guest link"
                onPress={() => {
                  void navigator.clipboard.writeText(guestLink.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {copied && <p className="mt-1 text-xs font-medium">Link copied.</p>}
            <p className="mt-1 text-xs">
              This link works without a Forkd account. It only opens this one bill, only lets this
              one person pick their items, and expires. Send it directly — don&apos;t post it
              anywhere public.
            </p>
          </Alert>
        )}

        {canEdit && (
          <>
            {available.length > 0 && (
              <Select
                label="Add a family member"
                size="sm"
                selectedKeys={new Set<string>()}
                onSelectionChange={(keys) => {
                  const id = Array.from(keys)[0] as string;
                  if (id) addParticipant.mutate({ splitId, userId: id });
                }}
              >
                {available.map((u) => (
                  <SelectItem key={u.id}>
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || "Unnamed"}
                  </SelectItem>
                ))}
              </Select>
            )}

            <div className="flex items-end gap-2">
              <Input
                label="Or add someone else"
                size="sm"
                placeholder="Name"
                value={guestName}
                onValueChange={setGuestName}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && guestName.trim()) {
                    addParticipant.mutate({ splitId, displayName: guestName.trim() });
                  }
                }}
              />
              <Button
                size="sm"
                variant="flat"
                startContent={<UserPlus className="h-4 w-4" />}
                isDisabled={!guestName.trim() || addParticipant.isPending}
                onPress={() => addParticipant.mutate({ splitId, displayName: guestName.trim() })}
              >
                Add
              </Button>
            </div>

            <Select
              label="Who paid the bill?"
              size="sm"
              selectedKeys={payerParticipantId ? new Set([payerParticipantId]) : new Set<string>()}
              onSelectionChange={(keys) => {
                const id = Array.from(keys)[0] as string;
                updateSplit.mutate({ id: splitId, paidByParticipantId: id ?? null });
              }}
            >
              {participants.map((p) => (
                <SelectItem key={p.id}>{p.displayName}</SelectItem>
              ))}
            </Select>
          </>
        )}

        {error && <Alert color="danger">{error}</Alert>}
      </CardBody>
    </Card>
  );
}
