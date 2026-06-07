"use client";

import { useState } from "react";
import { photoUrl } from "@/lib/photoUrl";
import { PhotoLightbox } from "./PhotoLightbox";

export interface PhotoItem {
  id: string;
  restaurantId: string;
  filePath: string;
  thumbPath: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  source: "user" | "google_places";
  createdAt: Date;
  uploadedByUserId: string | null;
  uploadedBy: { id: string; firstName: string | null; lastName: string | null } | null;
}

interface Props {
  restaurantId: string;
  photos: PhotoItem[];
  currentUserId: string;
  isAdmin: boolean;
  isOwner: boolean;
}

export function PhotoGallery({ restaurantId, photos, currentUserId, isAdmin, isOwner }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            className="aspect-square overflow-hidden rounded"
            onClick={() => setLightboxIndex(i)}
            type="button"
          >
            <img
              src={photoUrl(restaurantId, photo.id, "thumb")}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIndex}
          restaurantId={restaurantId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          isOwner={isOwner}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
