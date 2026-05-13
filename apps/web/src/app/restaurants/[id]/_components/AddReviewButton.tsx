"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { ReviewModal } from "./ReviewModal";

interface Props {
  restaurantId: string;
}

export function AddReviewButton({ restaurantId }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button color="primary" variant="flat" onPress={() => setIsOpen(true)}>
        Leave a review
      </Button>
      <ReviewModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        restaurantId={restaurantId}
        existingReview={null}
      />
    </>
  );
}
