"use client";

import dynamic from "next/dynamic";
import type { MapRestaurant } from "@forkd/ui";
import type { RestaurantStatus } from "@forkd/shared";

const DynamicMap = dynamic<{ restaurants: MapRestaurant[]; height?: string }>(
  () => import("@forkd/ui").then((m) => m.RestaurantMap),
  { ssr: false }
);

interface Props {
  id: string;
  name: string;
  status: RestaurantStatus;
  latitude: string;
  longitude: string;
  googleRating: string | null;
  googleRatingsTotal: number | null;
}

export function DetailMap({
  id,
  name,
  status,
  latitude,
  longitude,
  googleRating,
  googleRatingsTotal,
}: Props) {
  return (
    <DynamicMap
      restaurants={[{ id, name, status, latitude, longitude, googleRating, googleRatingsTotal }]}
      height="280px"
    />
  );
}
