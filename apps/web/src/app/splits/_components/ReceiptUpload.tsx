"use client";

import { useRef, useState } from "react";
import { Alert, Button, Spinner } from "@heroui/react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPT_IMAGES,
  RECEIPT_REENCODE_ABOVE_BYTES,
  RECEIPT_UPLOAD_MAX_EDGE,
} from "@forkd/shared";
import { downscaleImageFile, formatBytes } from "@/lib/clientImageResize";
import { receiptUrl } from "@/lib/receiptUrl";

interface Props {
  splitId: string;
  images: { id: string }[];
  onUploaded: () => void;
  onRemove?: (imageId: string) => void;
}

export function ReceiptUpload({ splitId, images, onUploaded, onRemove }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atLimit = images.length >= MAX_RECEIPT_IMAGES;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;

    setError(null);
    setUploading(true);

    try {
      // Phone photos are routinely 5–20 MB. Shrink to the size we'd store
      // anyway before sending, so a big photo just works instead of being
      // rejected — and so the upload is ~150 KB rather than ~15 MB.
      setStatus("Preparing photo…");
      const downscaled = await downscaleImageFile(
        original,
        RECEIPT_UPLOAD_MAX_EDGE,
        RECEIPT_REENCODE_ABOVE_BYTES
      );
      const file = downscaled?.file ?? original;

      // Only reachable when the browser couldn't decode the image at all
      // (typically HEIC outside Safari) and the original is genuinely huge.
      if (file.size > MAX_RECEIPT_BYTES) {
        setError(
          `That photo is ${formatBytes(file.size)}, which is too large to upload. ` +
            `Try taking it again at a lower resolution.`
        );
        return;
      }

      setStatus("Uploading…");
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/v1/splits/${splitId}/images`, { method: "POST", body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Upload failed (${res.status})`);
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* `capture="environment"` opens the rear camera directly on phones,
          rather than the OS file picker. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={handleFile}
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative">
              <img
                src={receiptUrl(splitId, img.id, "thumb")}
                alt="Receipt"
                className="h-32 w-24 rounded-lg border border-divider object-cover"
              />
              {onRemove && (
                <Button
                  isIconOnly
                  size="sm"
                  color="danger"
                  variant="flat"
                  aria-label="Remove photo"
                  className="absolute -right-2 -top-2"
                  onPress={() => onRemove(img.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="flat"
          startContent={uploading ? <Spinner size="sm" /> : <Camera className="h-4 w-4" />}
          isDisabled={atLimit || uploading}
          onPress={() => cameraRef.current?.click()}
        >
          {uploading ? (status ?? "Working…") : "Take photo"}
        </Button>
        <Button
          variant="flat"
          startContent={<ImagePlus className="h-4 w-4" />}
          isDisabled={atLimit || uploading}
          onPress={() => libraryRef.current?.click()}
        >
          Choose photo
        </Button>
      </div>

      <p className="text-xs text-default-500">
        Up to {MAX_RECEIPT_IMAGES} photos — useful for a long receipt that runs onto a second page,
        or a separate bar tab. Large photos are resized automatically, and location data is stripped
        from every photo before it&apos;s stored.
      </p>

      {atLimit && (
        <p className="text-xs text-default-500">
          That&apos;s the maximum. Remove one to add another.
        </p>
      )}

      {error && <Alert color="danger">{error}</Alert>}
    </div>
  );
}
