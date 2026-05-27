export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { TranscriptionConfigForm } from "./_components/TranscriptionConfigForm";

export default async function AdminTranscriptionPage() {
  const caller = await serverTrpc();
  const [me, configList] = await Promise.all([caller.auth.me(), caller.config.get()]);

  const fields = configList.filter((c) =>
    ["transcription.api_key", "transcription.model"].includes(c.key)
  );

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <TranscriptionConfigForm initialFields={fields} />
    </>
  );
}
