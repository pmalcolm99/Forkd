"use client";

import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Progress, Spinner } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function PhotoOptimizeCard() {
  const utils = trpc.useUtils();
  const status = trpc.storage.optimizeStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.phase === "running" ? 1500 : false),
  });
  const [notice, setNotice] = useState<{
    type: "warning" | "danger" | "success";
    text: string;
  } | null>(null);

  const refresh = () => Promise.all([status.refetch(), utils.storage.usage.invalidate()]);

  const optimize = trpc.storage.optimizeAll.useMutation({
    onSuccess: (res) => {
      if (res.started) {
        setNotice(null);
      } else if (res.reason === "insufficient_disk") {
        setNotice({
          type: "danger",
          text: `Not enough free disk. Need ~${formatBytes(res.needBytes)} free, have ${formatBytes(res.freeBytes)}. Free up space and try again.`,
        });
      } else if (res.reason === "nothing_to_do") {
        setNotice({ type: "success", text: "All photos are already optimized." });
      } else {
        setNotice({ type: "warning", text: "Optimization is already in progress." });
      }
      void refresh();
    },
    onError: (e) => setNotice({ type: "danger", text: e.message }),
  });
  const finalize = trpc.storage.finalizeOptimization.useMutation({
    onSuccess: (res) => {
      setNotice({ type: "success", text: `Finalized — reclaimed ${formatBytes(res.freedBytes)}.` });
      void refresh();
    },
    onError: (e) => setNotice({ type: "danger", text: e.message }),
  });
  const revert = trpc.storage.revertOptimization.useMutation({
    onSuccess: (res) => {
      setNotice({ type: "success", text: `Reverted ${res.reverted} photo(s) to their originals.` });
      void refresh();
    },
    onError: (e) => setNotice({ type: "danger", text: e.message }),
  });

  const s = status.data;
  const phase = s?.phase ?? "idle";
  const busy = optimize.isPending || finalize.isPending || revert.isPending;

  return (
    <Card className="mt-6">
      <CardHeader className="flex-col items-start">
        <h2 className="text-lg font-semibold">Photo optimization</h2>
        <p className="text-sm text-default-500">
          Re-encode existing photos smaller (no visible loss on phones/tablets). Originals are kept
          until you finalize, so you can revert. New photos are optimized automatically.
        </p>
      </CardHeader>
      <CardBody className="gap-3">
        {notice && <Alert color={notice.type}>{notice.text}</Alert>}

        {!s ? (
          <Spinner />
        ) : phase === "running" ? (
          <div className="space-y-1">
            <Progress aria-label="Optimizing" value={s.done} maxValue={Math.max(s.total, 1)} />
            <p className="text-sm text-default-500">
              Optimizing… {s.done} / {s.total}
              {s.failed > 0 ? ` · ${s.failed} failed` : ""}
            </p>
          </div>
        ) : phase === "awaiting_finalize" ? (
          <>
            <Alert color="warning">
              Optimized {s.done - s.failed} photo(s): {formatBytes(s.originalBytes)} →{" "}
              {formatBytes(s.optimizedBytes)} (saves{" "}
              {formatBytes(Math.max(0, s.originalBytes - s.optimizedBytes))}). Originals are still
              on disk — Finalize to reclaim that space, or Revert to undo.
            </Alert>
            <div className="flex gap-2">
              <Button
                color="success"
                isLoading={finalize.isPending}
                isDisabled={busy}
                onPress={() => finalize.mutate()}
              >
                Finalize
              </Button>
              <Button
                color="danger"
                variant="flat"
                isLoading={revert.isPending}
                isDisabled={busy}
                onPress={() => revert.mutate()}
              >
                Revert
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-default-500">
              {s.pendingCount === 0
                ? "All photos are optimized."
                : `${s.pendingCount} photo(s) not yet optimized (${formatBytes(s.pendingBytes)}).`}
            </p>
            <div>
              <Button
                color="primary"
                isLoading={optimize.isPending}
                isDisabled={busy || s.pendingCount === 0}
                onPress={() => optimize.mutate()}
              >
                Optimize now
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
