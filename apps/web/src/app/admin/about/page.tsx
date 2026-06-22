export const dynamic = "force-dynamic";

import { Card, CardBody } from "@heroui/react";
import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { RestartButton } from "../_components/RestartButton";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default async function AdminAboutPage() {
  const caller = await serverTrpc();
  const [me, stats] = await Promise.all([caller.auth.me(), caller.stats.overview()]);

  // APP_VERSION / APP_GIT_SHA are inlined at build time by next.config.ts.
  const version = process.env.APP_VERSION ?? "unknown";
  const gitSha = (process.env.APP_GIT_SHA ?? "dev").slice(0, 7);

  const statTiles: { label: string; value: string }[] = [
    { label: "Restaurants", value: String(stats.restaurants) },
    { label: "Want to try", value: String(stats.wantToTry) },
    { label: "Visited", value: String(stats.visited) },
    { label: "On the map", value: String(stats.withCoordinates) },
    { label: "Countries", value: String(stats.countries) },
    { label: "Cuisine types", value: String(stats.cuisineTypes) },
    { label: "Reviews", value: String(stats.reviews) },
    {
      label: "Avg rating",
      value: stats.averageStars != null ? `${stats.averageStars.toFixed(1)} ★` : "—",
    },
    { label: "Photos", value: `${stats.photos} (${formatBytes(stats.photoBytes)})` },
    { label: "Family members", value: `${stats.users} (${stats.admins} admin)` },
  ];

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />

      <div className="space-y-6">
        <Card>
          <CardBody className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Statistics</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {statTiles.map((tile) => (
                <div key={tile.label} className="rounded-lg bg-content2 p-4">
                  <div className="text-2xl font-bold text-foreground">{tile.value}</div>
                  <div className="mt-1 text-xs text-default-500">{tile.label}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-6">
            <h2 className="mb-4 text-lg font-semibold">About Forkd</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-4">
                <dt className="w-32 font-medium text-default-500">Version</dt>
                <dd className="text-foreground">
                  v{version} ({gitSha})
                </dd>
              </div>
              <div className="flex gap-4">
                <dt className="w-32 font-medium text-default-500">Source</dt>
                <dd>
                  <a
                    href="https://github.com/pmalcolm99/Forkd"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    GitHub
                  </a>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {!!me.isOwner && (
          <Card>
            <CardBody className="p-6">
              <h2 className="mb-2 text-lg font-semibold">Server restart</h2>
              <p className="mb-4 text-sm text-default-500">
                Gracefully restarts the webapp container. Docker automatically brings it back within
                5–15 seconds. Use this after changing configuration if the app is behaving
                unexpectedly.
              </p>
              <RestartButton />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
