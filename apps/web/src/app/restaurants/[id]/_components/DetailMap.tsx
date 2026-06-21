"use client";

import dynamic from "next/dynamic";
import { LocateFixed } from "lucide-react";
import type { MapRestaurant } from "@forkd/ui";
import type { RestaurantStatus } from "@forkd/shared";
import { useUserLocation } from "@/lib/useUserLocation";

const DynamicMap = dynamic<{
  restaurants: MapRestaurant[];
  height?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  locationZoom?: { version: number; radiusMiles?: number };
}>(() => import("@forkd/ui").then((m) => m.RestaurantMap), { ssr: false });

interface Props {
  id: string;
  name: string;
  status: RestaurantStatus;
  latitude: string;
  longitude: string;
  googleRating: string | null;
  googleRatingsTotal: number | null;
  coverPhotoUrl?: string | null;
}

export function DetailMap({
  id,
  name,
  status,
  latitude,
  longitude,
  googleRating,
  googleRatingsTotal,
  coverPhotoUrl,
}: Props) {
  const {
    location: userLocation,
    isLocating,
    refresh: refreshLocation,
    zoomVersion,
  } = useUserLocation();

  return (
    <div className="relative">
      <DynamicMap
        restaurants={[
          {
            id,
            name,
            status,
            latitude,
            longitude,
            googleRating,
            googleRatingsTotal,
            coverPhotoUrl: coverPhotoUrl ?? null,
          },
        ]}
        height="280px"
        userLocation={userLocation}
        locationZoom={userLocation ? { version: zoomVersion } : undefined}
      />
      <button
        onClick={refreshLocation}
        className="absolute bottom-3 right-3 z-[1000] rounded-full bg-blue-500 p-1.5 text-white shadow-lg transition-colors hover:bg-blue-600"
        aria-label="My location"
        title={isLocating ? "Getting location…" : "My location"}
      >
        <LocateFixed className={`h-4 w-4 ${isLocating ? "animate-pulse" : ""}`} />
      </button>
    </div>
  );
}
