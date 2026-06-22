import { Card, CardBody, CardFooter, CardHeader } from "@heroui/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@forkd/api";
import { formatRelativeTime } from "@forkd/shared";
import { ReviewActions } from "./ReviewActions";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ReviewWithReviewer = RouterOutputs["restaurants"]["get"]["reviews"][number];

interface Props {
  review: ReviewWithReviewer;
  isOwnReview: boolean;
}

function StarDisplay({ stars }: { stars: number | null }) {
  if (stars == null) return <span className="text-sm text-default-400">No rating</span>;
  return (
    <span aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < stars ? "text-yellow-400" : "text-default-300"}>
          {i < stars ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

export function ReviewCard({ review, isOwnReview }: Props) {
  const reviewerName = isOwnReview
    ? "You"
    : [review.user.firstName, review.user.lastName].filter(Boolean).join(" ") || "Unknown";

  return (
    <Card className="mb-3">
      <CardHeader className="flex items-center justify-between pb-1">
        <span className="font-medium">{reviewerName}</span>
        <StarDisplay stars={review.stars} />
      </CardHeader>
      {review.text && (
        <CardBody className="pt-0">
          <p className="text-sm">{review.text}</p>
        </CardBody>
      )}
      <CardFooter className="flex items-center justify-between pt-1">
        <span className="text-xs text-default-400">{formatRelativeTime(review.updatedAt)}</span>
        {isOwnReview && <ReviewActions review={review} restaurantId={review.restaurantId} />}
      </CardFooter>
    </Card>
  );
}
