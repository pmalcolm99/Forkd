"use client";

import { Button, Input, Select, SelectItem, Textarea } from "@heroui/react";
import type { CreateRestaurantInput } from "@forkd/shared";
import { RESTAURANT_STATUS_LABELS, US_STATES, createRestaurantInput } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { useZodForm } from "@/lib/useZodForm";

interface RestaurantFormProps {
  defaultValues?: Partial<CreateRestaurantInput>;
  onSubmit: (data: CreateRestaurantInput) => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

export function RestaurantForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel = "Save restaurant",
}: RestaurantFormProps) {
  const { values, setField, errors, handleSubmit } = useZodForm(
    createRestaurantInput,
    defaultValues ?? {}
  );

  const { data: cuisines } = trpc.cuisines.list.useQuery();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        label="Name"
        isRequired
        value={values.name ?? ""}
        onValueChange={(v) => setField("name", v)}
        isInvalid={!!errors.name}
        errorMessage={errors.name}
      />

      <Input
        label="Address"
        isRequired
        value={values.address ?? ""}
        onValueChange={(v) => setField("address", v)}
        isInvalid={!!errors.address}
        errorMessage={errors.address}
      />

      <Select
        label="State"
        isRequired
        selectedKeys={values.state ? new Set([values.state]) : new Set()}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as string;
          setField("state", val as CreateRestaurantInput["state"]);
        }}
        isInvalid={!!errors.state}
        errorMessage={errors.state}
      >
        {US_STATES.map((s) => (
          <SelectItem key={s.code}>{s.name}</SelectItem>
        ))}
      </Select>

      <Select
        label="Cuisine type"
        selectedKeys={values.cuisineTypeId ? new Set([values.cuisineTypeId]) : new Set([""])}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as string;
          setField("cuisineTypeId", val === "" ? null : val);
        }}
        isInvalid={!!errors.cuisineTypeId}
        errorMessage={errors.cuisineTypeId}
      >
        {[
          <SelectItem key="">Other / unknown</SelectItem>,
          ...(cuisines ?? []).map((c) => <SelectItem key={c.id}>{c.name}</SelectItem>),
        ]}
      </Select>

      <Select
        label="Status"
        isRequired
        selectedKeys={values.status ? new Set([values.status]) : new Set(["want_to_try"])}
        onSelectionChange={(keys) => {
          const val = Array.from(keys)[0] as string;
          setField("status", val as CreateRestaurantInput["status"]);
        }}
        isInvalid={!!errors.status}
        errorMessage={errors.status}
      >
        {Object.entries(RESTAURANT_STATUS_LABELS).map(([k, label]) => (
          <SelectItem key={k}>{label}</SelectItem>
        ))}
      </Select>

      <Input
        label="Website"
        type="url"
        value={values.website ?? ""}
        onValueChange={(v) => setField("website", v || null)}
        isInvalid={!!errors.website}
        errorMessage={errors.website}
      />

      <Textarea
        label="Description"
        value={values.description ?? ""}
        onValueChange={(v) => setField("description", v || null)}
        isInvalid={!!errors.description}
        errorMessage={errors.description}
      />

      <Button type="submit" color="primary" isLoading={isSubmitting} isDisabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
