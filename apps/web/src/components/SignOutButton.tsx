"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="bordered"
      onPress={async () => {
        await authClient.signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
