export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";

export default async function AdminBackupPage() {
  const caller = await serverTrpc();
  let me: Awaited<ReturnType<typeof caller.auth.me>> | null = null;
  try {
    me = await caller.auth.me();
  } catch {
    return notFound();
  }

  if (!me.isOwner) return notFound();

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={true} />
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
        <p className="text-lg font-medium">Backup management</p>
        <p className="mt-2 text-sm">Coming in Phase 11.</p>
      </div>
    </>
  );
}
