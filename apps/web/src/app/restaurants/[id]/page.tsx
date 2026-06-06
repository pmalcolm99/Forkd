import { notFound } from "next/navigation";
import { Chip } from "@heroui/react";
import { LinkButton } from "@/components/LinkButton";
import { TRPCError } from "@trpc/server";
import {
  RESTAURANT_STATUS_COLORS,
  RESTAURANT_STATUS_LABELS,
  formatRelativeTime,
} from "@forkd/shared";
import { serverTrpc } from "@/lib/trpc/server";
import { DeleteRestaurantButton } from "./_components/DeleteRestaurantButton";
import { DetailMap } from "./_components/DetailMap";
import { RatingDisplay } from "./_components/RatingDisplay";
import { RefreshGoogleRatingButton } from "./_components/RefreshGoogleRatingButton";
import { ReviewCard } from "./_components/ReviewCard";
import { AddReviewButton } from "./_components/AddReviewButton";
import { PhotoGallery } from "./_components/PhotoGallery";
import { PhotoUploadButton } from "./_components/PhotoUploadButton";

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

  const { configured: googlePlacesConfigured } = await caller.restaurants.googlePlacesConfigured();

  let currentUser: Awaited<ReturnType<typeof caller.auth.me>> | null = null;
  try {
    currentUser = await caller.auth.me();
  } catch {
    // not signed in — page still renders, just no actions
  }

  const canDelete =
    currentUser !== null &&
    (currentUser.isAdmin || currentUser.isOwner || row.addedByUserId === currentUser.id);

  const myReview = currentUser
    ? (row.reviews.find((r) => r.userId === currentUser.id) ?? null)
    : null;
  const otherReviews = currentUser
    ? row.reviews.filter((r) => r.userId !== currentUser.id)
    : row.reviews;

  const statusColor = RESTAURANT_STATUS_COLORS[row.status];
  const addedBy = row.addedBy
    ? [row.addedBy.firstName, row.addedBy.lastName].filter(Boolean).join(" ")
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <LinkButton href="/" variant="light" size="sm" className="mb-4 -ml-2">
        ← All restaurants
      </LinkButton>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{row.name}</h1>
        <Chip color={statusColor.color} className={statusColor.className}>
          {RESTAURANT_STATUS_LABELS[row.status]}
        </Chip>
        <RatingDisplay average={row.familyAverage} count={row.reviewCount} />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <LinkButton href={`/restaurants/${id}/edit`} variant="flat">
          Edit
        </LinkButton>
        {canDelete && <DeleteRestaurantButton id={id} />}
        <RefreshGoogleRatingButton
          restaurantId={id}
          googlePlaceId={row.googlePlaceId}
          googlePlacesConfigured={googlePlacesConfigured}
        />
      </div>

      {(row.latitude === null || row.longitude === null) && (
        <p className="mb-4 text-sm text-amber-600">
          No map coordinates — use &ldquo;Refresh metadata&rdquo; to fetch them so this restaurant
          appears on the map.
        </p>
      )}

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
              <dd className="max-w-prose">{row.description}</dd>
            </>
          )}

          <dt className="font-medium text-gray-500">Google rating</dt>
          <dd>
            {row.googleRating !== null ? `${parseFloat(row.googleRating)} / 5` : "—"}
            {row.googleRatingFetchedAt && (
              <span className="ml-2 text-xs text-gray-400">
                (updated {formatRelativeTime(row.googleRatingFetchedAt)})
              </span>
            )}
          </dd>
        </dl>
      </div>

      <p className="mb-4 text-sm text-gray-400">
        Added{addedBy ? ` by ${addedBy}` : ""} · {formatRelativeTime(row.createdAt)}
      </p>

      {row.latitude !== null && row.longitude !== null && (
        <div className="mb-8 overflow-hidden rounded-lg border">
          <DetailMap
            id={row.id}
            name={row.name}
            status={row.status}
            latitude={row.latitude}
            longitude={row.longitude}
          />
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">Reviews</h2>

        {myReview ? (
          <ReviewCard review={myReview} isOwnReview={true} />
        ) : (
          currentUser && <AddReviewButton restaurantId={id} />
        )}

        {otherReviews.map((r) => (
          <ReviewCard key={r.id} review={r} isOwnReview={false} />
        ))}

        {row.reviews.length === 0 && <p className="mt-2 text-sm text-gray-400">No reviews yet.</p>}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">Photos</h2>
        {currentUser && (
          <div className="mb-4">
            <PhotoUploadButton restaurantId={id} photoCount={row.photos.length} />
          </div>
        )}
        {row.photos.length > 0 ? (
          <PhotoGallery
            restaurantId={id}
            photos={row.photos}
            currentUserId={currentUser?.id ?? ""}
            isAdmin={currentUser?.isAdmin ?? false}
            isOwner={currentUser?.isOwner ?? false}
          />
        ) : (
          <p className="mt-2 text-sm text-gray-400">No photos yet.</p>
        )}
      </section>
    </main>
  );
}
