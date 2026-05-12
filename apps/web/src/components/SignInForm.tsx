"use client";

import { Button, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const data = new FormData(e.currentTarget);

    const result = await authClient.signIn.email({
      email: data.get("email") as string,
      password: data.get("password") as string,
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Sign-in failed. Check your credentials.");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Sign In</h1>
      {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input name="email" type="email" label="Email" isRequired />
        <Input name="password" type="password" label="Password" isRequired />
        <Button type="submit" color="primary" isLoading={loading} className="mt-2">
          Sign In
        </Button>
      </form>
    </div>
  );
}
