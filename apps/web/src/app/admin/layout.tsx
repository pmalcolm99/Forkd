import { notFound } from "next/navigation";
import { serverTrpc } from "@/lib/trpc/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const caller = await serverTrpc();
  let me: Awaited<ReturnType<typeof caller.auth.me>> | null = null;
  try {
    me = await caller.auth.me();
  } catch {
    return notFound();
  }

  if (!me.isAdmin && !me.isOwner) {
    return notFound();
  }

  return <div className="mx-auto max-w-4xl p-6">{children}</div>;
}
