export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { RestartButton } from "../_components/RestartButton";

export default async function AdminAboutPage() {
  const caller = await serverTrpc();
  const me = await caller.auth.me();

  const version = process.env.npm_package_version ?? "unknown";

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">About Forkd</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-500">Version</dt>
              <dd className="text-gray-900">{version}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-32 font-medium text-gray-500">Source</dt>
              <dd>
                <a
                  href="https://github.com/norish-recipes/norish"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  GitHub
                </a>
              </dd>
            </div>
          </dl>
        </div>

        {!!me.isOwner && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold">Server restart</h2>
            <p className="mb-4 text-sm text-gray-500">
              Gracefully restarts the webapp container. Docker automatically brings it back within
              5–15 seconds. Use this after changing configuration if the app is behaving
              unexpectedly.
            </p>
            <RestartButton />
          </div>
        )}
      </div>
    </>
  );
}
