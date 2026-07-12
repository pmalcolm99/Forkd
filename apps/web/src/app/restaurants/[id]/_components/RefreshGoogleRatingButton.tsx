"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tooltip } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  restaurantId: string;
  googlePlacesConfigured: boolean;
}

export function RefreshGoogleRatingButton({ restaurantId, googlePlacesConfigured }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = trpc.restaurants.refreshGoogleRating.useMutation({
    onSuccess() {
      setError(null);
      router.refresh();
    },
    onError(err) {
      setError(err.message);
    },
  });

  const disabledReason = !googlePlacesConfigured
    ? "Configure Google Places API key in admin settings"
    : null;

  return (
    <div className="flex flex-col gap-1">
      <Tooltip content={disabledReason ?? ""} isDisabled={disabledReason === null}>
        <Button
          variant="flat"
          isLoading={isPending}
          isDisabled={disabledReason !== null || isPending}
          onPress={() => {
            setError(null);
            mutate({ restaurantId });
          }}
        >
          Refresh metadata
        </Button>
      </Tooltip>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
