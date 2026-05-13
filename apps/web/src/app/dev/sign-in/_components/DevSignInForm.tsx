"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

export function DevSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // devSignIn is structurally absent in production (conditional spread in authRouter);
  // this component is only rendered in dev — page.tsx returns notFound() in production
  const { mutate, isPending, error } = trpc.auth.devSignIn!.useMutation({
    onSuccess() {
      router.push("/restaurants");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      email,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });
  }

  return (
    <Form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {error && <Alert color="danger" title="Sign-in failed" description={error.message} />}
      <Input
        label="Email"
        type="email"
        value={email}
        onValueChange={setEmail}
        isRequired
        autoFocus
      />
      <Input label="First name" value={firstName} onValueChange={setFirstName} />
      <Input label="Last name" value={lastName} onValueChange={setLastName} />
      <Button type="submit" color="primary" isLoading={isPending} isDisabled={isPending} fullWidth>
        Sign in
      </Button>
    </Form>
  );
}
