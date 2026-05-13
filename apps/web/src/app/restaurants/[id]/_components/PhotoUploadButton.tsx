"use client";

import { useRef, useState } from "react";
import { Alert, Button, Spinner, Tooltip } from "@heroui/react";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_RESTAURANT } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";

interface Props {
  restaurantId: string;
  photoCount: number;
}

export function PhotoUploadButton({ restaurantId, photoCount }: Props) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = photoCount >= MAX_PHOTOS_PER_RESTAURANT;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Immediate client-side size check — no fetch needed
    if (file.size > MAX_PHOTO_BYTES) {
      setError(
        `Photo must be under 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("restaurantId", restaurantId);
      body.append("file", file);

      const res = await fetch("/api/v1/photos/upload", { method: "POST", body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Upload failed (${res.status})`);
      }

      await utils.restaurants.get.invalidate({ id: restaurantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={handleFileChange}
      />

      <Tooltip content="Photo limit reached" isDisabled={!atLimit}>
        <Button
          color="primary"
          variant="flat"
          isDisabled={atLimit || uploading}
          onPress={() => fileInputRef.current?.click()}
          startContent={uploading ? <Spinner size="sm" /> : undefined}
        >
          {uploading ? "Uploading…" : "Add photo"}
        </Button>
      </Tooltip>

      {error && (
        <Alert color="danger" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  );
}
