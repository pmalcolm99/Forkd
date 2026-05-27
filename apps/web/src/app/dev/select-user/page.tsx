export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { db, user } from "@forkd/db";
import { DevSelectUserForm } from "./_components/DevSelectUserForm";

export default async function DevSelectUserPage() {
  if (process.env.NODE_ENV === "production") return notFound();
  if (process.env.CF_ACCESS_ENABLED === "true") return notFound();

  const users = await db
    .select({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName })
    .from(user)
    .orderBy(user.createdAt);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Dev Sign-In</h1>
      <DevSelectUserForm users={users} />
    </main>
  );
}
