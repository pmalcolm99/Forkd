import { notFound } from "next/navigation";
import Link from "next/link";
import { Button, Chip } from "@heroui/react";
import { TRPCError } from "@trpc/server";
import {
  RESTAURANT_STATUS_COLORS,
  RESTAURANT_STATUS_LABELS,
  formatRelativeTime,
} from "@forkd/shared";
import { serverTrpc } from "@/lib/trpc/server";
import { DeleteRestaurantButton } from "./_components/DeleteRestaurantButton";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RestaurantDetailPage({ params }: Props) {
  const { id } = await params;
  const caller = await serverTrpc();

  let row: Awaited<ReturnType<typeof caller.restaurants.get>>;
  try {
    row = await caller.restaurants.get({ id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  let currentUser: Awaited<ReturnType<typeof caller.auth.me>> | null = null;
  try {
    currentUser = await caller.auth.me();
  } catch {
    // not signed in — page still renders, just no actions
  }

  const canDelete =
    currentUser !== null &&
    (currentUser.isAdmin || currentUser.isOwner || row.addedByUserId === currentUser.id);

  const statusColor = RESTAURANT_STATUS_COLORS[row.status];
  const addedBy = row.addedBy
    ? [row.addedBy.firstName, row.addedBy.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{row.name}</h1>
        <Chip color={statusColor.color} className={statusColor.className}>
          {RESTAURANT_STATUS_LABELS[row.status]}
        </Chip>
      </div>

      <div className="mb-4 flex gap-3">
        <Button as={Link} href={`/restaurants/${id}/edit`} variant="flat">
          Edit
        </Button>
        {canDelete && <DeleteRestaurantButton id={id} />}
      </div>

      <div className="mb-6 rounded-lg border p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-gray-500">Address</dt>
          <dd>{row.address}</dd>

          <dt className="font-medium text-gray-500">State</dt>
          <dd>{row.state}</dd>

          <dt className="font-medium text-gray-500">Cuisine</dt>
          <dd>{row.cuisineType?.name ?? "—"}</dd>

          {row.website && (
            <>
              <dt className="font-medium text-gray-500">Website</dt>
              <dd>
                <a
                  href={row.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {row.website}
                </a>
              </dd>
            </>
          )}

          {row.description && (
            <>
              <dt className="font-medium text-gray-500">Description</dt>
              <dd>{row.description}</dd>
            </>
          )}
        </dl>
      </div>

      <p className="mb-8 text-sm text-gray-400">
        Added{addedBy ? ` by ${addedBy}` : ""} · {formatRelativeTime(row.createdAt)}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4 text-center text-gray-400">
          Reviews coming in Phase 3
        </div>
        <div className="rounded-lg border p-4 text-center text-gray-400">
          Photos coming in Phase 4
        </div>
      </div>
    </main>
  );
}
