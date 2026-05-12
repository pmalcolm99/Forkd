export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, user } from "@forkd/db";
import { passwordAuthEnabled } from "@forkd/auth";
import { SignInForm } from "@/components/SignInForm";

export default async function SignInPage() {
  const [result] = await db.select({ count: count() }).from(user);
  if ((result?.count ?? 0) === 0) {
    redirect("/bootstrap");
  }

  const pwEnabled = await passwordAuthEnabled();
  if (!pwEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold">Sign In</h1>
          <p className="text-gray-500">Sign-in via Cloudflare Access only — coming in Phase 5.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignInForm />
    </main>
  );
}
