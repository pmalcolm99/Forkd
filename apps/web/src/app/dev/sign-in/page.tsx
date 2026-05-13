import { notFound } from "next/navigation";
import { DevSignInForm } from "./_components/DevSignInForm";

export default function DevSignInPage() {
  if (process.env.NODE_ENV === "production") return notFound();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Dev sign-in</h1>
      <p className="text-sm text-gray-500">
        Sign in as any user for testing. Not available in production.
      </p>
      <DevSignInForm />
    </main>
  );
}
