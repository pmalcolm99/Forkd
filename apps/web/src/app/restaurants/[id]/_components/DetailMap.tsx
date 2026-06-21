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
  const { location: userLocation, isLocating, refresh: refreshLocation } = useUserLocation();

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
      />
      <button
        onClick={refreshLocation}
        className="absolute bottom-3 right-3 z-[1000] rounded-full bg-white p-1.5 shadow-md"
        aria-label="My location"
        title={isLocating ? "Getting location…" : "My location"}
      >
        <LocateFixed
          className={`h-4 w-4 ${isLocating ? "animate-pulse text-blue-400" : userLocation ? "text-blue-600" : "text-gray-500"}`}
        />
      </button>
    </div>
  );
}
