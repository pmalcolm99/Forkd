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
}

export function DetailMap({ id, name, status, latitude, longitude }: Props) {
  return <DynamicMap restaurants={[{ id, name, status, latitude, longitude }]} height="280px" />;
}
