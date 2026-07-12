"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LocateFixed } from "lucide-react";
import { Button, Spinner } from "@heroui/react";
import { STATE_GEO_BOUNDS, type StateBounds } from "@forkd/shared";
import { trpc } from "@/lib/trpc/client";
import { useRestaurantFilters } from "@/lib/useRestaurantFilters";
import { useApplyDefaultFilters } from "@/lib/useApplyDefaultFilters";
import { useUserLocation } from "@/lib/useUserLocation";
import { RestaurantFilterControls } from "@/components/RestaurantFilterControls";
import { photoUrl } from "@/lib/photoUrl";
import type { MapRestaurant } from "@forkd/ui";

const DynamicMap = dynamic<{
  restaurants: MapRestaurant[];
  height?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  locationZoom?: { version: number; radiusMiles?: number };
  initialBounds?: StateBounds | null;
  disableAutoFit?: boolean;
}>(() => import("@forkd/ui").then((m) => m.RestaurantMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-lg bg-default-100">
      <Spinner size="lg" />
    </div>
  ),
});

export function MapClientWrapper() {
  const { filters, updateFilter, resetFilters } = useRestaurantFilters();
  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const didInitView = useRef(false);
  const {
    location: userLocation,
    isLocating,
    error: locationError,
    refresh: refreshLocation,
    focus: focusLocation,
    zoomVersion,
  } = useUserLocation();
  const { data: radiusMiles } = trpc.config.locationRadiusMiles.useQuery();

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

  useApplyDefaultFilters(me?.defaultFilters?.map, me !== undefined);

  const mapDefaultView = me?.mapDefaultView ?? "current_location";
  const homeStateBounds =
    mapDefaultView === "home_state" && me?.homeState
      ? (STATE_GEO_BOUNDS[me.homeState] ?? null)
      : null;

  // Suppress the fit-to-all-restaurants view whenever we have an intended focus,
  // so it doesn't override it on re-renders (the "reverts to whole country" bug).
  // Falls back to fit-all only when current-location has no fix yet (e.g. denied).
  const disableAutoFit =
    (mapDefaultView === "current_location" && !!userLocation) || !!homeStateBounds;

  // One-shot on mount (once the profile has loaded): focus the map per the user's
  // default map view. Current location uses a cached fix if fresh (no prompt),
  // otherwise prompts once; home state uses the state bounds (handled via prop).
  useEffect(() => {
    if (didInitView.current || me === undefined) return;
    didInitView.current = true;
    if (mapDefaultView === "current_location") {
      if (userLocation) focusLocation();
      else refreshLocation();
    }
  }, [me]); // one-shot; deps intentionally minimal

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
    coverPhotoUrl: r.coverPhoto ? photoUrl(r.id, r.coverPhoto.id, "thumb") : null,
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
        homeState={me?.homeState ?? null}
      />

      {missingCount > 0 && (
        <p className="mb-3 text-sm text-default-500">
          {missingCount} restaurant{missingCount !== 1 ? "s" : ""} not shown — no location data yet.
        </p>
      )}

      {/* isolate creates a CSS stacking context so Leaflet's internal z-indexes
          (400–1000+) are contained here and don't overlap the Navbar or Drawer */}
      <div className="relative isolate">
        <div className="h-[50dvh] sm:h-[calc(100dvh-240px)]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-default-100">
              <Spinner size="lg" />
            </div>
          ) : (
            <DynamicMap
              restaurants={mapRestaurants}
              height="100%"
              userLocation={userLocation}
              locationZoom={
                userLocation ? { version: zoomVersion, radiusMiles: radiusMiles ?? 25 } : undefined
              }
              initialBounds={homeStateBounds}
              disableAutoFit={disableAutoFit}
            />
          )}
        </div>
        <button
          onClick={refreshLocation}
          className="absolute bottom-4 right-4 z-[1000] rounded-full bg-blue-500 p-2.5 text-white shadow-lg transition-colors hover:bg-blue-600"
          aria-label="My location"
          title={isLocating ? "Getting location…" : (locationError ?? "My location")}
        >
          <LocateFixed className={`h-5 w-5 ${isLocating ? "animate-pulse" : ""}`} />
        </button>
        {locationError && (
          <p className="absolute bottom-4 left-4 z-[1000] max-w-[60%] rounded-md bg-white/90 px-2 py-1 text-xs text-danger shadow">
            {locationError}
          </p>
        )}
      </div>
    </main>
  );
}
