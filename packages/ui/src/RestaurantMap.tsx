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
  googleRating: string | null;
  googleRatingsTotal: number | null;
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
            <div style={{ minWidth: "160px" }}>
              <p className="font-semibold">{r.name}</p>
              <p className="text-sm text-gray-600">{RESTAURANT_STATUS_LABELS[r.status]}</p>
              {r.googleRating && (
                <p className="text-sm text-gray-600">
                  ★ {parseFloat(r.googleRating).toFixed(1)}
                  {r.googleRatingsTotal != null
                    ? ` (${r.googleRatingsTotal.toLocaleString()})`
                    : ""}
                </p>
              )}
              <div className="mt-2 flex flex-col gap-0.5">
                <a href={`/restaurants/${r.id}`} className="text-sm underline">
                  View details
                </a>
                <a
                  href={`https://maps.apple.com/?ll=${r.latitude},${r.longitude}&q=${encodeURIComponent(r.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  Apple Maps
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  Google Maps
                </a>
                <a
                  href={`https://waze.com/ul?ll=${r.latitude},${r.longitude}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline"
                >
                  Waze
                </a>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
