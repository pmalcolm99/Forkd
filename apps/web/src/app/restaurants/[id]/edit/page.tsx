"use client";

import { useParams, useRouter } from "next/navigation";
import { Alert, Spinner } from "@heroui/react";
import type { CreateRestaurantInput } from "@forkd/shared";
import { restaurantRowToInput } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { RestaurantForm } from "../../_components/RestaurantForm";

export default function EditRestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.restaurants.get.useQuery({ id });

  const { mutate, isPending } = trpc.restaurants.update.useMutation({
    async onSuccess() {
      await utils.restaurants.get.invalidate({ id });
      router.push(`/restaurants/${id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <Alert color="danger">{error?.message ?? "Restaurant not found."}</Alert>
      </main>
    );
  }

  function handleSubmit(fields: CreateRestaurantInput) {
    mutate({ id, ...fields });
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Edit restaurant</h1>
      <RestaurantForm
        defaultValues={restaurantRowToInput(data)}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        submitLabel="Update restaurant"
      />
    </main>
  );
}
