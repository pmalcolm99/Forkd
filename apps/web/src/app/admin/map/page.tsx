export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { MapConfigForm } from "./_components/MapConfigForm";

export default async function AdminMapPage() {
  const caller = await serverTrpc();
  const [me, configList] = await Promise.all([caller.auth.me(), caller.config.get()]);

  const fields = configList.filter((c) => c.key === "map.location_radius_miles");

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <MapConfigForm initialFields={fields} />
    </>
  );
}
