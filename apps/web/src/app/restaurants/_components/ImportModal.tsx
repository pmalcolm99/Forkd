"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued...",
  downloading: "Downloading video...",
  transcribing: "Transcribing audio...",
  extracting: "Extracting restaurant info...",
  completed: "Done!",
  failed: "Failed",
};

export function ImportModal({ isOpen, onClose }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const startMutation = trpc.import.start.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
    },
    onError: (err) => {
      setUrlError(err.message);
    },
  });

  const statusQuery = trpc.import.status.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        return s === "completed" || s === "failed" ? false : 2000;
      },
    }
  );

  const status = statusQuery.data?.status;
  const step = statusQuery.data?.step;
  const errorMessage = statusQuery.data?.errorMessage;
  const restaurantId = statusQuery.data?.restaurantId;

  if (status === "completed" && restaurantId) {
    router.push(`/restaurants/${restaurantId}/edit`);
  }

  function handleClose() {
    setUrl("");
    setJobId(null);
    setUrlError(null);
    onClose();
  }

  function handleSubmit() {
    setUrlError(null);
    startMutation.mutate({ url });
  }

  const isPolling = !!jobId && status !== "completed" && status !== "failed";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalContent>
        <ModalHeader>Import from social media</ModalHeader>
        <ModalBody>
          {!jobId ? (
            <>
              <Input
                label="Post URL"
                placeholder="https://www.tiktok.com/@user/video/..."
                value={url}
                onValueChange={(v) => {
                  setUrl(v);
                  setUrlError(null);
                }}
                isInvalid={!!urlError}
                errorMessage={urlError ?? undefined}
              />
              <p className="text-sm text-gray-500">Supported: TikTok, YouTube, Facebook</p>
            </>
          ) : status === "failed" ? (
            <p className="text-danger text-sm">
              {errorMessage ?? "Import failed. Please try again."}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <Spinner size="lg" />
              <p className="text-sm text-gray-600">{STATUS_LABELS[status ?? "queued"] ?? status}</p>
              {step && status !== "queued" && <p className="text-xs text-gray-400">{step}</p>}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleClose} isDisabled={isPolling}>
            {status === "failed" ? "Close" : "Cancel"}
          </Button>
          {!jobId && (
            <Button
              color="primary"
              onPress={handleSubmit}
              isLoading={startMutation.isPending}
              isDisabled={!url.trim()}
            >
              Import
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
