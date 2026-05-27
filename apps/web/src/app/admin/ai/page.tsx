export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { AiConfigForm } from "./_components/AiConfigForm";

export default async function AdminAiPage() {
  const caller = await serverTrpc();
  const [me, configList] = await Promise.all([caller.auth.me(), caller.config.get()]);

  const fields = configList.filter((c) => ["ai.claude.api_key", "ai.claude.model"].includes(c.key));

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <AiConfigForm initialFields={fields} />
    </>
  );
}
