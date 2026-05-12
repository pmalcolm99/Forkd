"use client";

import { Button, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

export function WelcomeForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => router.push("/"),
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    updateProfile.mutate({
      firstName: data.get("firstName") as string,
      lastName: data.get("lastName") as string,
    });
  };

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-2 text-2xl font-bold">Welcome!</h1>
      <p className="mb-6 text-gray-500">What should we call you?</p>
      {error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <Input name="firstName" label="First Name" isRequired />
          <Input name="lastName" label="Last Name" isRequired />
        </div>
        <Button type="submit" color="primary" isLoading={updateProfile.isPending} className="mt-2">
          Save
        </Button>
      </form>
    </div>
  );
}
