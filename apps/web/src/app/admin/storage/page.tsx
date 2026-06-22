export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { StoragePanel } from "./_components/StoragePanel";

export default async function AdminStoragePage() {
  const caller = await serverTrpc();
  const me = await caller.auth.me();

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <StoragePanel />
    </>
  );
}
