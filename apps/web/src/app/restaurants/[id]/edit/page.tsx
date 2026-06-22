"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Alert, Button, Spinner } from "@heroui/react";
import type { CreateRestaurantInput } from "@forkd/shared";
import { restaurantRowToInput } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { RestaurantForm } from "../../_components/RestaurantForm";

export default function EditRestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDuplicate = searchParams.get("duplicate") === "1";
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit restaurant</h1>
        <div className="flex items-center gap-2">
          <Button as={Link} href={`/restaurants/${id}`} variant="flat">
            Cancel
          </Button>
          <Button
            type="submit"
            form="restaurant-edit-form"
            color="primary"
            isLoading={isPending}
            isDisabled={isPending}
          >
            Update
          </Button>
        </div>
      </div>
      {isDuplicate && (
        <Alert color="warning" className="mb-4">
          This restaurant is already in your list — you can update its details below or just close
          this page.
        </Alert>
      )}
      <RestaurantForm
        formId="restaurant-edit-form"
        defaultValues={restaurantRowToInput(data)}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        submitLabel="Update restaurant"
      />
    </main>
  );
}
