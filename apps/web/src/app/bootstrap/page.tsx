export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { count } from "drizzle-orm";
import { db, user } from "@forkd/db";
import { BootstrapForm } from "@/components/BootstrapForm";

export default async function BootstrapPage() {
  const [result] = await db.select({ count: count() }).from(user);
  if ((result?.count ?? 0) > 0) {
    notFound();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <BootstrapForm />
    </main>
  );
}
