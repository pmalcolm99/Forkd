"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button, Spinner } from "@heroui/react";
import { trpc } from "@/lib/trpc/client";
import { useRestaurantFilters } from "@/lib/useRestaurantFilters";
import { RestaurantFilterControls } from "@/components/RestaurantFilterControls";
import type { MapRestaurant } from "@forkd/ui";

const DynamicMap = dynamic<{ restaurants: MapRestaurant[]; height?: string }>(
  () => import("@forkd/ui").then((m) => m.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-lg bg-gray-100"
        style={{ height: "calc(100dvh - 240px)" }}
      >
        <Spinner size="lg" />
      </div>
    ),
  }
);

export function MapClientWrapper() {
  const { filters, updateFilter, resetFilters } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const hasSetHomeState = useRef(false);

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
  const { data: me } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!hasSetHomeState.current && me !== undefined) {
      hasSetHomeState.current = true;
      if (me.homeState && !filters.state) {
        updateFilter("state", me.homeState);
      }
    }
  }, [me]); // intentionally omits filters/updateFilter — stable, one-shot on mount

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
    googleRating: r.googleRating ?? null,
    googleRatingsTotal: r.googleRatingsTotal ?? null,
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
        resetFilters={resetFilters}
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

      {/* isolate creates a CSS stacking context so Leaflet's internal z-indexes
          (400–1000+) are contained here and don't overlap the Navbar or Drawer */}
      <div className="isolate">
        {isLoading ? (
          <div
            className="flex items-center justify-center rounded-lg bg-gray-100"
            style={{ height: "calc(100dvh - 240px)" }}
          >
            <Spinner size="lg" />
          </div>
        ) : (
          <DynamicMap restaurants={mapRestaurants} height="calc(100dvh - 240px)" />
        )}
      </div>
    </main>
  );
}
