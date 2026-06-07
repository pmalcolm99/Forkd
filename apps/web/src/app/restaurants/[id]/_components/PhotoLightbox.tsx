"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { formatRelativeTime } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { photoUrl } from "@/lib/photoUrl";
import type { PhotoItem } from "./PhotoGallery";

interface Props {
  photos: PhotoItem[];
  startIndex: number;
  restaurantId: string;
  currentUserId: string;
  isAdmin: boolean;
  isOwner: boolean;
  onClose: () => void;
}

export function PhotoLightbox({
  photos,
  startIndex,
  restaurantId,
  currentUserId,
  isAdmin,
  isOwner,
  onClose,
}: Props) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const photo = photos[currentIndex]!;
  // Google photos have uploadedByUserId=null; only admins/owners can delete them.
  const canDelete = photo.uploadedByUserId === currentUserId || isAdmin || isOwner;

  const { mutate: deletePhoto, isPending: deleting } = trpc.photos.delete.useMutation({
    onSuccess() {
      router.refresh();
      onClose();
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setCurrentIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);

  // Reset confirm state when navigating
  useEffect(() => {
    setConfirmingDelete(false);
  }, [currentIndex]);

  const isGooglePhoto = photo.source === "google_places";
  const uploaderName = photo.uploadedBy
    ? [photo.uploadedBy.firstName, photo.uploadedBy.lastName].filter(Boolean).join(" ") || "Unknown"
    : "Unknown";

  return (
    <Modal isOpen size="5xl" onClose={onClose} classNames={{ base: "max-h-screen" }}>
      <ModalContent>
        <ModalHeader className="flex items-center justify-between">
          <span>
            Photo {currentIndex + 1} of {photos.length}
          </span>
        </ModalHeader>

        <ModalBody className="flex items-center justify-center p-2">
          <img
            src={photoUrl(restaurantId, photo.id, "full")}
            alt=""
            className="max-h-[60vh] max-w-full rounded object-contain"
          />
        </ModalBody>

        <ModalFooter className="flex flex-col gap-2">
          {/* Nav + caption row */}
          <div className="flex w-full items-center justify-between">
            <Button
              isIconOnly
              variant="flat"
              isDisabled={currentIndex === 0}
              onPress={() => setCurrentIndex((i) => i - 1)}
              aria-label="Previous photo"
            >
              ‹
            </Button>

            <span className="text-sm text-gray-500">
              {isGooglePhoto ? (
                <>Photo: Google · {formatRelativeTime(photo.createdAt)}</>
              ) : (
                <>
                  Uploaded by {uploaderName} · {formatRelativeTime(photo.createdAt)}
                </>
              )}
            </span>

            <Button
              isIconOnly
              variant="flat"
              isDisabled={currentIndex === photos.length - 1}
              onPress={() => setCurrentIndex((i) => i + 1)}
              aria-label="Next photo"
            >
              ›
            </Button>
          </div>

          {/* Delete row */}
          {canDelete && (
            <div className="flex w-full justify-end gap-2">
              {confirmingDelete ? (
                <>
                  <span className="self-center text-sm">Delete this photo?</span>
                  <Button
                    color="danger"
                    size="sm"
                    isLoading={deleting}
                    onPress={() => deletePhoto({ id: photo.id })}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="flat" onPress={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  color="danger"
                  variant="flat"
                  size="sm"
                  onPress={() => setConfirmingDelete(true)}
                >
                  Delete photo
                </Button>
              )}
            </div>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
