"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  Spinner,
} from "@heroui/react";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { photoUrl } from "@/lib/photoUrl";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type PendingDelete =
  | { kind: "photo"; photoId: string; label: string }
  | { kind: "orphan"; relPath: string; label: string };

export function StoragePanel() {
  const utils = trpc.useUtils();
  const usage = trpc.storage.usage.useQuery();
  const media = trpc.storage.listMedia.useQuery();

  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);

  async function invalidate() {
    await Promise.all([utils.storage.usage.invalidate(), utils.storage.listMedia.invalidate()]);
  }

  const deletePhoto = trpc.storage.deletePhoto.useMutation({
    async onSuccess() {
      setPending(null);
      await invalidate();
    },
    onError: (e) => setActionError(e.message),
  });
  const deleteOrphan = trpc.storage.deleteOrphanFile.useMutation({
    async onSuccess() {
      setPending(null);
      await invalidate();
    },
    onError: (e) => setActionError(e.message),
  });
  const clearVideos = trpc.storage.clearOrphanedVideos.useMutation({
    async onSuccess(res) {
      setVideoResult(
        res.count === 0
          ? "No leftover transcription videos found."
          : `Removed ${res.count} folder${res.count === 1 ? "" : "s"}, freed ${formatBytes(res.freedBytes)}.`
      );
      await invalidate();
    },
    onError: (e) => setVideoResult(e.message),
  });

  const isDeleting = deletePhoto.isPending || deleteOrphan.isPending;

  function confirmDelete() {
    setActionError(null);
    if (!pending) return;
    if (pending.kind === "photo") deletePhoto.mutate({ photoId: pending.photoId });
    else deleteOrphan.mutate({ relPath: pending.relPath });
  }

  // Group photos by restaurant for the browser.
  const grouped = new Map<
    string,
    { name: string; photos: NonNullable<typeof media.data>["photos"] }
  >();
  for (const p of media.data?.photos ?? []) {
    const g = grouped.get(p.restaurantId) ?? { name: p.restaurantName, photos: [] };
    g.photos.push(p);
    grouped.set(p.restaurantId, g);
  }
  const orphans = media.data?.orphans ?? [];

  return (
    <div className="space-y-6">
      {/* Usage summary */}
      <Card>
        <CardHeader className="flex-col items-start">
          <h2 className="text-lg font-semibold">Disk usage</h2>
          <p className="text-sm text-default-500">
            Storage on the server volume. Note: the app can&apos;t read Docker directly, so this is
            the underlying disk plus a breakdown of what Forkd is using.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {usage.isLoading ? (
            <Spinner />
          ) : usage.data ? (
            <>
              <Progress
                aria-label="Disk used"
                value={usage.data.diskUsedBytes}
                maxValue={usage.data.diskTotalBytes}
                color={
                  usage.data.diskFreeBytes / usage.data.diskTotalBytes < 0.1 ? "danger" : "primary"
                }
              />
              <p className="text-sm text-default-500">
                {formatBytes(usage.data.diskUsedBytes)} used of{" "}
                {formatBytes(usage.data.diskTotalBytes)} —{" "}
                <span className="font-medium text-foreground">
                  {formatBytes(usage.data.diskFreeBytes)} free
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip variant="flat">Photos: {formatBytes(usage.data.uploadsBytes)}</Chip>
                <Chip variant="flat">Backups: {formatBytes(usage.data.backupsBytes)}</Chip>
                <Chip variant="flat">Database: {formatBytes(usage.data.dbBytes)}</Chip>
                <Chip variant="flat">{usage.data.photoCount} photos</Chip>
              </div>
            </>
          ) : (
            <Alert color="danger">Couldn&apos;t load storage usage.</Alert>
          )}
        </CardBody>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader className="flex-col items-start">
          <h2 className="text-lg font-semibold">Maintenance</h2>
          <p className="text-sm text-default-500">
            Transcription videos are downloaded to temporary storage and removed automatically after
            each import. This clears any leftovers from interrupted jobs.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <Button
              color="secondary"
              variant="flat"
              isLoading={clearVideos.isPending}
              onPress={() => {
                setVideoResult(null);
                clearVideos.mutate();
              }}
            >
              Clear transcription videos
            </Button>
          </div>
          {videoResult && <p className="text-sm text-default-500">{videoResult}</p>}
        </CardBody>
      </Card>

      {/* Orphaned files */}
      {orphans.length > 0 && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Orphaned files ({orphans.length})</h2>
            <p className="text-sm text-default-500">
              Files on disk with no database record — safe to delete to reclaim space.
            </p>
          </CardHeader>
          <CardBody className="space-y-2">
            {orphans.map((o) => (
              <div
                key={o.relPath}
                className="flex items-center justify-between gap-3 rounded-lg bg-content2 px-3 py-2"
              >
                <span className="min-w-0 break-all text-sm">{o.relPath}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-default-500">{formatBytes(o.byteSize)}</span>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label="Delete file"
                    onPress={() =>
                      setPending({ kind: "orphan", relPath: o.relPath, label: o.relPath })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Media browser */}
      <Card>
        <CardHeader className="flex-col items-start">
          <h2 className="text-lg font-semibold">Media browser</h2>
          <p className="text-sm text-default-500">
            All photos stored on the server, by restaurant.
          </p>
        </CardHeader>
        <CardBody className="space-y-6">
          {media.isLoading ? (
            <Spinner />
          ) : grouped.size === 0 ? (
            <p className="text-sm text-default-500">No photos stored.</p>
          ) : (
            [...grouped.entries()].map(([restaurantId, group]) => (
              <div key={restaurantId} className="space-y-2">
                <h3 className="text-sm font-semibold">{group.name}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {group.photos.map((p) => (
                    <div key={p.photoId} className="overflow-hidden rounded-lg bg-content2">
                      <img
                        src={photoUrl(p.restaurantId, p.photoId, "thumb")}
                        alt=""
                        className="h-28 w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-1 p-2">
                        <div className="flex flex-col gap-1">
                          <Chip
                            size="sm"
                            variant="flat"
                            color={p.source === "google_places" ? "secondary" : "default"}
                          >
                            {p.source === "google_places" ? "Google" : "User"}
                          </Chip>
                          <span className="text-xs text-default-500">
                            {formatBytes(p.byteSize)}
                          </span>
                        </div>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          aria-label="Delete photo"
                          onPress={() =>
                            setPending({
                              kind: "photo",
                              photoId: p.photoId,
                              label: `this photo from ${group.name}`,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Modal isOpen={pending !== null} onClose={() => setPending(null)}>
        <ModalContent>
          <ModalHeader>Delete media?</ModalHeader>
          <ModalBody>
            {actionError && <Alert color="danger">{actionError}</Alert>}
            <p>
              Permanently delete {pending?.label}? This removes the file(s) from disk and cannot be
              undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setPending(null)}>
              Cancel
            </Button>
            <Button color="danger" isLoading={isDeleting} onPress={confirmDelete}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
