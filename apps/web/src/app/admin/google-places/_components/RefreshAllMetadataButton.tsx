"use client";

import { Button, Card, CardBody, CardHeader, Progress } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

export function RefreshAllMetadataButton() {
  const status = trpc.restaurants.refreshAllMetadataStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.running ? 1500 : false),
  });
  const start = trpc.restaurants.refreshAllMetadata.useMutation({
    onSuccess: () => status.refetch(),
  });

  const s = status.data;
  const running = !!s?.running;
  const showProgress = !!s && (s.running || !!s.finishedAt) && s.total > 0;

  return (
    <Card className="mt-6">
      <CardHeader className="flex-col items-start">
        <h2 className="text-lg font-semibold">Refresh all metadata</h2>
        <p className="text-sm text-default-500">
          Re-pull Google rating, price level, opening hours, and (if missing) photos for every
          restaurant linked to Google Places. Handy after adding new fields like price tracking.
          This counts toward the API usage above.
        </p>
      </CardHeader>
      <CardBody className="gap-3">
        <div>
          <Button
            color="primary"
            isLoading={start.isPending || running}
            isDisabled={running}
            onPress={() => start.mutate()}
          >
            {running ? "Refreshing…" : "Refresh all now"}
          </Button>
        </div>

        {showProgress && (
          <div className="space-y-1">
            <Progress
              aria-label="Refresh progress"
              value={s.done}
              maxValue={s.total}
              color={running ? "primary" : "success"}
            />
            <p className="text-sm text-default-500">
              {s.done} / {s.total} processed · {s.updated} updated
              {s.failed > 0 ? ` · ${s.failed} failed` : ""}
              {!s.running && s.finishedAt ? " · done" : ""}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
