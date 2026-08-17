export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { BillsConfigForm } from "./_components/BillsConfigForm";

export default async function AdminBillsPage() {
  const caller = await serverTrpc();
  const [me, configList] = await Promise.all([caller.auth.me(), caller.config.get()]);

  const fields = configList.filter((c) => c.key.startsWith("receipts."));

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <BillsConfigForm initialFields={fields} isOwner={!!me.isOwner} />
    </>
  );
}
