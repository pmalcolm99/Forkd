import Link from "next/link";
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

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/" className="mb-4 inline-block text-sm text-default-500 hover:text-default-700">
        ← Home
      </Link>
      {children}
    </div>
  );
}
