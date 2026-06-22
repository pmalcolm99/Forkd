export const dynamic = "force-dynamic";

import { Card, CardBody } from "@heroui/react";
import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { RestartButton } from "../_components/RestartButton";

export default async function AdminAboutPage() {
  const caller = await serverTrpc();
  const me = await caller.auth.me();

  // APP_VERSION / APP_GIT_SHA are inlined at build time by next.config.ts.
  const version = process.env.APP_VERSION ?? "unknown";
  const gitSha = (process.env.APP_GIT_SHA ?? "dev").slice(0, 7);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />

      <div className="space-y-6">
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
