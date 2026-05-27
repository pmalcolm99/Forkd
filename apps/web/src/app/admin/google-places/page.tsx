export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { GooglePlacesConfigForm } from "./_components/GooglePlacesConfigForm";

export default async function AdminGooglePlacesPage() {
  const caller = await serverTrpc();
  const [me, configList] = await Promise.all([caller.auth.me(), caller.config.get()]);

  const fields = configList.filter((c) => c.key === "google_places.api_key");

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <GooglePlacesConfigForm initialFields={fields} />
    </>
  );
}
