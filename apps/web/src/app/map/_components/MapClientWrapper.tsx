"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button, Spinner } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";
import { useRestaurantFilters } from "@/lib/useRestaurantFilters";
import { RestaurantFilterControls } from "@/components/RestaurantFilterControls";
import type { MapRestaurant } from "@forkd/ui";

const DynamicMap = dynamic<{ restaurants: MapRestaurant[] }>(
  () => import("@forkd/ui").then((m) => m.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] items-center justify-center rounded-lg bg-gray-100">
        <Spinner size="lg" />
      </div>
    ),
  }
);

export function MapClientWrapper() {
  const { filters, updateFilter } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilter("search", searchValue || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchValue]); // intentionally omits updateFilter — stable across renders via router

  const { data, isLoading } = trpc.restaurants.list.useQuery({
    ...filters,
    pageSize: 500,
  });
  const { data: cuisines } = trpc.cuisines.list.useQuery();
  const { data: users } = trpc.users.listForFilter.useQuery();

  const allItems = data?.items ?? [];
  const withCoords = allItems.filter(
    (r): r is typeof r & { latitude: string; longitude: string } =>
      r.latitude !== null && r.longitude !== null
  );
  const missingCount = allItems.length - withCoords.length;

  const mapRestaurants: MapRestaurant[] = withCoords.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Map</h1>
        <Button as={Link} href="/restaurants" variant="flat">
          List view
        </Button>
      </div>

      <RestaurantFilterControls
        filters={filters}
        updateFilter={updateFilter}
        cuisines={cuisines ?? []}
        users={users ?? []}
        searchValue={searchValue}
        onSearchValueChange={setSearchValue}
      />

      {missingCount > 0 && (
        <p className="mb-3 text-sm text-gray-500">
          {missingCount} restaurant{missingCount !== 1 ? "s" : ""} not shown — no location data yet.
        </p>
      )}

      {isLoading ? (
        <div className="flex h-[600px] items-center justify-center rounded-lg bg-gray-100">
          <Spinner size="lg" />
        </div>
      ) : (
        <DynamicMap restaurants={mapRestaurants} />
      )}
    </main>
  );
}
