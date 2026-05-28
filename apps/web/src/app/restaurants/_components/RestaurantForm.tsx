"use client";

import { useState } from "react";
import { Button, Input, Select, SelectItem, Textarea, Tooltip } from "@heroui/react";
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

  const [suggestError, setSuggestError] = useState<string | null>(null);

  const { data: cuisines } = trpc.cuisines.list.useQuery();
  const { data: aiConfig } = trpc.restaurants.claudeConfigured.useQuery();

  const suggest = trpc.restaurants.suggestMetadata.useMutation({
    onSuccess(result) {
      if (result.status === "success") {
        setField("description", result.description);
        const match = cuisines?.find((c) => c.name.toLowerCase() === result.cuisine.toLowerCase());
        if (match) setField("cuisineTypeId", match.id);
        setSuggestError(null);
      } else if (result.status === "failed") {
        setSuggestError("AI suggestion failed. You can fill in the fields manually.");
      }
    },
    onError() {
      setSuggestError("AI suggestion failed. You can fill in the fields manually.");
    },
  });

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

      <div className="flex flex-col gap-1">
        <Tooltip
          content="Configure a Claude API key in admin settings to enable AI suggestions"
          isDisabled={!!aiConfig?.configured}
        >
          <Button
            color="secondary"
            variant="flat"
            isLoading={suggest.isPending}
            isDisabled={!aiConfig?.configured || suggest.isPending}
            onPress={() =>
              suggest.mutate({
                name: values.name ?? "",
                address: values.address,
                website: values.website,
              })
            }
          >
            Suggest cuisine &amp; description with AI
          </Button>
        </Tooltip>
        {suggestError && <p className="text-sm text-danger">{suggestError}</p>}
      </div>

      <Button type="submit" color="primary" isLoading={isSubmitting} isDisabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
