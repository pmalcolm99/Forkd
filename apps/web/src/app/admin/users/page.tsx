export const dynamic = "force-dynamic";

import { serverTrpc } from "@/lib/trpc/server";
import { AdminTabs } from "../_components/AdminTabs";
import { UsersTable } from "./_components/UsersTable";

export default async function AdminUsersPage() {
  const caller = await serverTrpc();
  const [me, users] = await Promise.all([caller.auth.me(), caller.users.list()]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>
      <AdminTabs isOwner={!!me.isOwner} />
      <UsersTable users={users} currentUserId={me.id} isOwner={!!me.isOwner} />
    </>
  );
}
