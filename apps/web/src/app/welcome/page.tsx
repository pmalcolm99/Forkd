export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { serverTrpc } from "@/lib/trpc/server";
import { WelcomeForm } from "@/components/WelcomeForm";

export default async function WelcomePage() {
  const caller = await serverTrpc();
  let currentUser: Awaited<ReturnType<typeof caller.auth.me>>;
  try {
    currentUser = await caller.auth.me();
  } catch {
    redirect("/sign-in");
  }

  if (currentUser.firstName && currentUser.lastName) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <WelcomeForm />
    </main>
  );
}
