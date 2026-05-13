export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, user } from "@forkd/db";
import { serverTrpc } from "@/lib/trpc/server";

export default async function HomePage() {
  const [result] = await db.select({ count: count() }).from(user);
  if ((result?.count ?? 0) === 0) {
    redirect("/bootstrap");
  }

  const caller = await serverTrpc();
  let currentUser: Awaited<ReturnType<typeof caller.auth.me>>;
  try {
    currentUser = await caller.auth.me();
  } catch {
    redirect("/sign-in");
  }

  if (!currentUser.firstName || !currentUser.lastName) {
    redirect("/welcome");
  }

  redirect("/restaurants");
}
