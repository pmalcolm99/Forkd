"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Divider, Input } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Props {
  users: User[];
}

export function DevSelectUserForm({ users }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const selectMutation = trpc.auth.devSelectUser!.useMutation({
    onSuccess: () => router.push("/"),
    onError: (err) => setError(err.message),
  });

  const createMutation = trpc.auth.devCreateUser!.useMutation({
    onSuccess: () => router.push("/"),
    onError: (err) => setError(err.message),
  });

  const isPending = selectMutation.isPending || createMutation.isPending;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    createMutation.mutate({
      email: email.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {error && (
        <Alert color="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {users.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No users yet — create one below.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-600">Sign in as:</p>
          {users.map((u) => {
            const label =
              u.firstName && u.lastName ? `${u.firstName} ${u.lastName} (${u.email})` : u.email;
            return (
              <Button
                key={u.id}
                variant="flat"
                isDisabled={isPending}
                isLoading={selectMutation.isPending && selectMutation.variables?.userId === u.id}
                onPress={() => {
                  setError(null);
                  selectMutation.mutate({ userId: u.id });
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      <Divider />

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-600">Create new user:</p>
        <Input
          label="Email"
          type="email"
          isRequired
          value={email}
          onValueChange={setEmail}
          isDisabled={isPending}
        />
        <Input
          label="First name (optional)"
          value={firstName}
          onValueChange={setFirstName}
          isDisabled={isPending}
        />
        <Input
          label="Last name (optional)"
          value={lastName}
          onValueChange={setLastName}
          isDisabled={isPending}
        />
        <Button
          type="submit"
          color="primary"
          isLoading={createMutation.isPending}
          isDisabled={isPending || !email.trim()}
        >
          Create &amp; sign in
        </Button>
      </form>
    </div>
  );
}
