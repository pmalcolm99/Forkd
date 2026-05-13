"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@heroui/react";
import type { CreateRestaurantInput } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { RestaurantForm } from "../_components/RestaurantForm";

export default function NewRestaurantPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = trpc.restaurants.create.useMutation({
    onSuccess(row) {
      router.push(`/restaurants/${row.id}`);
    },
    onError(err) {
      setError(err.message);
    },
  });

  function handleSubmit(data: CreateRestaurantInput) {
    setError(null);
    mutate(data);
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Add restaurant</h1>
      {error && (
        <Alert color="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <RestaurantForm
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        submitLabel="Add restaurant"
      />
    </main>
  );
}
