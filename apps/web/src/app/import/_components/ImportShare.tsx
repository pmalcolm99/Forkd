"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Spinner } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued…",
  downloading: "Downloading video…",
  transcribing: "Transcribing audio…",
  extracting: "Extracting restaurant info…",
  completed: "Done!",
  duplicate_found: "Already in your list",
  failed: "Failed",
};
const TERMINAL_STATUSES = new Set(["completed", "failed", "duplicate_found"]);

/** Pull the first http(s) URL out of the shared title/text/url params. */
function extractUrl(parts: (string | null)[]): string | null {
  const haystack = parts.filter(Boolean).join(" ");
  const m = /https?:\/\/[^\s]+/.exec(haystack);
  // Trim trailing punctuation that often rides along in shared text.
  return m ? m[0].replace(/[)\].,]+$/, "") : null;
}

export function ImportShare() {
  const router = useRouter();
  const params = useSearchParams();
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const sharedUrl = extractUrl([params.get("url"), params.get("text"), params.get("title")]);

  const startMutation = trpc.import.start.useMutation({
    onSuccess: (data) => setJobId(data.jobId),
    onError: (err) => setError(err.message),
  });

  // Kick off the import once on mount when a URL was shared.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (sharedUrl) startMutation.mutate({ url: sharedUrl });
  }, [sharedUrl]); // fire once; startMutation is stable

  const statusQuery = trpc.import.status.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: !!jobId,
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        return s && TERMINAL_STATUSES.has(s) ? false : 2000;
      },
    }
  );

  const status = statusQuery.data?.status;
  const restaurantId = statusQuery.data?.restaurantId;

  useEffect(() => {
    if (status === "completed" && restaurantId) router.push(`/restaurants/${restaurantId}/edit`);
    if (status === "duplicate_found" && restaurantId)
      router.push(`/restaurants/${restaurantId}/edit?duplicate=1`);
  }, [status, restaurantId, router]);

  if (!sharedUrl) {
    return (
      <div className="flex flex-col gap-4">
        <Alert color="warning">No link was found in what you shared.</Alert>
        <p className="text-sm text-default-500">
          Share a TikTok, YouTube, or Facebook post to Forkd, or add a restaurant manually.
        </p>
        <div className="flex gap-2">
          <Button as="a" href="/restaurants" variant="flat">
            Go to restaurants
          </Button>
          <Button as="a" href="/restaurants/new" color="primary">
            Add manually
          </Button>
        </div>
      </div>
    );
  }

  if (error || status === "failed") {
    return (
      <div className="flex flex-col gap-4">
        <Alert color="danger">
          {error ?? statusQuery.data?.errorMessage ?? "Import failed. Please try again."}
        </Alert>
        <p className="break-all text-xs text-default-400">{sharedUrl}</p>
        <Button as="a" href="/restaurants" variant="flat">
          Back to restaurants
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <Spinner size="lg" />
      <p className="text-sm text-default-600">{STATUS_LABELS[status ?? "queued"] ?? status}</p>
      <p className="max-w-full break-all text-center text-xs text-default-400">{sharedUrl}</p>
    </div>
  );
}
