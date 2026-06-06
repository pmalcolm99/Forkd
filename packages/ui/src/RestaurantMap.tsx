"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import {
  RESTAURANT_STATUS_PIN_COLORS,
  RESTAURANT_STATUS_LABELS,
  type RestaurantStatus,
} from "@forkd/shared";

export interface MapRestaurant {
  id: string;
  name: string;
  status: RestaurantStatus;
  latitude: string;
  longitude: string;
}

interface Props {
  restaurants: MapRestaurant[];
  height?: string;
}

interface FitBoundsProps {
  restaurants: MapRestaurant[];
}

function FitBounds({ restaurants }: FitBoundsProps) {
  const map = useMap();

  if (restaurants.length === 0) return null;

  if (restaurants.length === 1) {
    const r = restaurants[0];
    if (r) map.setView([parseFloat(r.latitude), parseFloat(r.longitude)], 13);
    return null;
  }

  const bounds = L.latLngBounds(
    restaurants.map((r) => [parseFloat(r.latitude), parseFloat(r.longitude)] as [number, number])
  );
  map.fitBounds(bounds, { padding: [40, 40] });
  return null;
}

export function RestaurantMap({ restaurants, height = "600px" }: Props) {
  return (
    <MapContainer center={[39.83, -98.58]} zoom={4} style={{ height, width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds restaurants={restaurants} />
      {restaurants.map((r) => (
        <CircleMarker
          key={r.id}
          center={[parseFloat(r.latitude), parseFloat(r.longitude)]}
          radius={8}
          pathOptions={{
            fillColor: RESTAURANT_STATUS_PIN_COLORS[r.status],
            fillOpacity: 1,
            color: "white",
            weight: 2,
          }}
        >
          <Popup>
            <div>
              <p className="font-semibold">{r.name}</p>
              <p className="text-sm text-gray-600">{RESTAURANT_STATUS_LABELS[r.status]}</p>
              <a href={`/restaurants/${r.id}`} className="text-sm underline">
                View details
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
