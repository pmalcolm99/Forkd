"use client";

import Link from "next/link";
import { Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import { Plus, Receipt } from "lucide-react";
import { formatCents, formatRelativeTime } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";

export function SplitList() {
  const { data, isLoading, error } = trpc.splits.list.useQuery({
    includeArchived: false,
    page: 1,
    pageSize: 50,
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bills</h1>
        <Button
          as={Link}
          href="/splits/new"
          color="primary"
          startContent={<Plus className="h-4 w-4" />}
        >
          Split a bill
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <p className="text-sm text-danger">{error.message}</p>}

      {data && data.length === 0 && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 p-10 text-center">
            <Receipt className="h-10 w-10 text-default-400" />
            <div>
              <p className="font-medium">No bills yet</p>
              <p className="mt-1 text-sm text-default-500">
                Snap a photo of a receipt and Forkd will pull out the line items, then everyone
                picks what they ordered.
              </p>
            </div>
            <Button as={Link} href="/splits/new" color="primary" className="mt-2">
              Split a bill
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {data?.map((s) => {
          const subtitle = s.merchantName ?? s.restaurant?.name ?? null;
          return (
            <Card key={s.id} isPressable as={Link} href={`/splits/${s.id}`} className="w-full">
              <CardBody className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.title}</p>
                    {subtitle && <p className="truncate text-sm text-default-500">{subtitle}</p>}
                    <p className="mt-1 text-xs text-default-400">
                      {s.purchasedAt
                        ? new Date(s.purchasedAt).toLocaleDateString()
                        : formatRelativeTime(s.createdAt)}
                      {" · "}
                      {s.participantCount} {s.participantCount === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatCents(s.totalCents, s.currency)}</p>
                    {s.myShareCents != null && (
                      <p className="text-xs text-default-500">
                        your share {formatCents(s.myShareCents, s.currency)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.aiStatus === "queued" || s.aiStatus === "processing" ? (
                    <Chip size="sm" variant="flat" color="primary">
                      Reading receipt…
                    </Chip>
                  ) : null}
                  {s.aiStatus === "failed" && (
                    <Chip size="sm" variant="flat" color="danger">
                      Scan failed
                    </Chip>
                  )}
                  {s.itemCount === 0 && s.aiStatus !== "queued" && s.aiStatus !== "processing" && (
                    <Chip size="sm" variant="flat" color="warning">
                      No items yet
                    </Chip>
                  )}
                  {s.unclaimedCount > 0 && (
                    <Chip size="sm" variant="flat" color="warning">
                      {s.unclaimedCount} unclaimed
                    </Chip>
                  )}
                  {s.unclaimedCount === 0 && s.itemCount > 0 && (
                    <Chip size="sm" variant="flat" color="success">
                      All claimed
                    </Chip>
                  )}
                  {s.myPaidAt && (
                    <Chip size="sm" variant="flat" color="success">
                      You paid
                    </Chip>
                  )}
                  {s.status === "settled" && (
                    <Chip size="sm" variant="flat" color="success">
                      Settled
                    </Chip>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
