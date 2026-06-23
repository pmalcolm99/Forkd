"use client";

import { Card, CardBody, CardHeader, Spinner } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

const ENDPOINT_LABELS: Record<string, string> = {
  search: "Text search",
  details: "Place details",
  photo: "Photos",
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function GooglePlacesUsage() {
  const { data, isLoading } = trpc.config.googlePlacesUsage.useQuery();

  return (
    <Card className="mt-6">
      <CardHeader className="flex-col items-start">
        <h2 className="text-lg font-semibold">API usage</h2>
        <p className="text-sm text-default-500">
          Google Places calls made from Forkd. Cost is a rough estimate (actual billing depends on
          the field tier) — use the counts as the reliable signal.
        </p>
      </CardHeader>
      <CardBody>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(["today", "month"] as const).map((scope) => {
              const counts = data[scope];
              const est = scope === "today" ? data.estCostToday : data.estCostMonth;
              return (
                <div key={scope} className="rounded-lg bg-content2 p-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-medium">
                      {scope === "today" ? "Today" : "Last 30 days"}
                    </span>
                    <span className="text-xs text-default-500">~{money(est)}</span>
                  </div>
                  <dl className="space-y-1 text-sm">
                    {(["search", "details", "photo"] as const).map((ep) => (
                      <div key={ep} className="flex justify-between">
                        <dt className="text-default-500">{ENDPOINT_LABELS[ep]}</dt>
                        <dd className="font-medium">{counts[ep].toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
