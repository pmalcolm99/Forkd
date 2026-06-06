"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@heroui/react";
import type { CreateRestaurantInput } from "@forkd/shared";
import { usStateEnum } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { RestaurantForm } from "../_components/RestaurantForm";

type Step = "search" | "form";

function extractUSState(address: string): string | null {
  const m = /\b([A-Z]{2})\s+\d{5}\b/.exec(address) ?? /,\s+([A-Z]{2})(?:,|\s+USA)/.exec(address);
  return m?.[1] ?? null;
}

export default function NewRestaurantPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [prefill, setPrefill] = useState<Partial<CreateRestaurantInput>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: gpConfig } = trpc.restaurants.googlePlacesConfigured.useQuery();
  const googlePlacesConfigured = gpConfig?.configured ?? false;

  const { data: searchData, isFetching: isSearching } =
    trpc.restaurants.searchGooglePlaces.useQuery(
      { query: searchQuery },
      { enabled: searchEnabled && searchQuery.trim().length > 0 }
    );

  const { mutate, isPending } = trpc.restaurants.create.useMutation({
    onSuccess(row) {
      router.push(`/restaurants/${row.id}`);
    },
    onError(err) {
      setSubmitError(err.message);
    },
  });

  function handleSubmit(data: CreateRestaurantInput) {
    setSubmitError(null);
    mutate(data);
  }

  // Skip search step when Google Places key is not configured (gpConfig loaded = false)
  // Only skip after we know the config value (gpConfig !== undefined)
  const skipSearch = gpConfig !== undefined && !googlePlacesConfigured;

  if (skipSearch || step === "form") {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Add restaurant</h1>
        {submitError && (
          <Alert color="danger" className="mb-4">
            {submitError}
          </Alert>
        )}
        <RestaurantForm
          defaultValues={prefill}
          onSubmit={handleSubmit}
          isSubmitting={isPending}
          submitLabel="Add restaurant"
        />
      </main>
    );
  }

  // Search step
  const results = searchData?.status === "success" ? searchData.results : [];
  const searchFailed = searchData?.status === "failed";
  const searched = searchEnabled && !isSearching && searchData !== undefined;

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Add restaurant</h1>
      <p className="mb-4 text-sm text-gray-500">
        Search Google Places to auto-fill restaurant details, or skip to enter them manually.
      </p>

      <div className="mb-4 flex gap-2">
        <Input
          label="Restaurant name and location"
          placeholder="e.g. Casa Bonita, Lakewood, CO"
          value={searchQuery}
          onValueChange={(v) => {
            setSearchQuery(v);
            setSearchEnabled(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchQuery.trim()) {
              e.preventDefault();
              setSearchEnabled(true);
            }
          }}
          className="flex-1"
        />
        <Button
          color="primary"
          isLoading={isSearching}
          isDisabled={!searchQuery.trim() || isSearching}
          onPress={() => setSearchEnabled(true)}
          className="self-end"
        >
          Search
        </Button>
      </div>

      {searchFailed && (
        <Alert color="warning" className="mb-4">
          Search failed. Try a different query or add the restaurant manually.
        </Alert>
      )}

      {searched && results.length === 0 && !searchFailed && (
        <p className="mb-4 text-sm text-gray-500">No results found.</p>
      )}

      {results.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {results.map((result) => (
            <button
              key={result.placeId}
              type="button"
              className="rounded-lg border p-3 text-left hover:bg-gray-50 cursor-pointer"
              onClick={() => {
                const state = usStateEnum.safeParse(extractUSState(result.formattedAddress)).data;
                setPrefill({
                  name: result.name,
                  address: result.formattedAddress,
                  state,
                  website: result.website ?? undefined,
                  googlePlaceId: result.placeId,
                  googleRating: result.rating ?? undefined,
                  latitude: result.latitude,
                  longitude: result.longitude,
                });
                setStep("form");
              }}
            >
              <p className="font-medium">{result.name}</p>
              <p className="text-sm text-gray-500">{result.formattedAddress}</p>
              {result.rating !== null && (
                <p className="text-sm text-gray-400">Google rating: {result.rating} / 5</p>
              )}
            </button>
          ))}
        </div>
      )}

      <Button
        variant="light"
        onPress={() => {
          setPrefill({});
          setStep("form");
        }}
      >
        None of these — enter manually
      </Button>
    </main>
  );
}
