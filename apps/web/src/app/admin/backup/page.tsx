export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { BackupsSection } from "./_components/BackupsSection";
import { ExportSection } from "./_components/ExportSection";
import { ImportSection } from "./_components/ImportSection";

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
      <div className="space-y-6">
        <BackupsSection />
        <ExportSection />
        <ImportSection />
      </div>
    </>
  );
}
