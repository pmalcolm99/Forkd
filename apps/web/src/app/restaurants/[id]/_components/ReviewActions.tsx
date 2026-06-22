"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";
import type { ReviewWithReviewer } from "./ReviewCard";
import { ReviewModal } from "./ReviewModal";

interface Props {
  review: ReviewWithReviewer;
  restaurantId: string;
}

export function ReviewActions({ review, restaurantId }: Props) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<"edit" | "delete" | null>(null);

  const deleteMutation = trpc.reviews.delete.useMutation({
    onSuccess: () => {
      router.refresh();
      setOpenModal(null);
    },
  });

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="flat" onPress={() => setOpenModal("edit")}>
          Edit
        </Button>
        <Button size="sm" variant="flat" color="danger" onPress={() => setOpenModal("delete")}>
          Delete
        </Button>
      </div>

      <ReviewModal
        key={review.id}
        isOpen={openModal === "edit"}
        onClose={() => setOpenModal(null)}
        restaurantId={restaurantId}
        existingReview={review}
      />

      <Modal isOpen={openModal === "delete"} onClose={() => setOpenModal(null)}>
        <ModalContent>
          <ModalHeader>Delete review</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to delete your review? This cannot be undone.</p>
            {deleteMutation.error && (
              <p className="text-sm text-danger">{deleteMutation.error.message}</p>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpenModal(null)}>
              Cancel
            </Button>
            <Button
              color="danger"
              isLoading={deleteMutation.isPending}
              onPress={() => deleteMutation.mutate({ id: review.id })}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
