import { serverTrpc } from "@/lib/trpc/server";
import { ProfileForm } from "./_components/ProfileForm";

export default async function ProfilePage() {
  const caller = await serverTrpc();
  const me = await caller.auth.me();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>
      <ProfileForm defaultValues={me} />
    </main>
  );
}
