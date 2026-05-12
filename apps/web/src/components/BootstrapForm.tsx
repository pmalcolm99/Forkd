"use client";

import { Button, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function BootstrapForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");

  const bootstrap = trpc.auth.completeBootstrap.useMutation({
    onSuccess: () => router.push("/"),
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const password = data.get("password") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    bootstrap.mutate({
      email: data.get("email") as string,
      password,
      firstName: data.get("firstName") as string,
      lastName: data.get("lastName") as string,
    });
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Create Owner Account</h1>
      {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <Input name="firstName" label="First Name" isRequired />
          <Input name="lastName" label="Last Name" isRequired />
        </div>
        <Input name="email" type="email" label="Email" isRequired />
        <Input
          name="password"
          type="password"
          label="Password"
          description="At least 12 characters with uppercase, lowercase, number, and special character"
          isRequired
        />
        <Input
          type="password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          isRequired
        />
        <Button type="submit" color="primary" isLoading={bootstrap.isPending} className="mt-2">
          Create Account
        </Button>
      </form>
    </div>
  );
}
