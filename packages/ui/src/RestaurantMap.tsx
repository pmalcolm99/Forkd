"use client";

import { useEffect, useRef } from "react";
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
  coverPhotoUrl: string | null;
}

type GeoBounds = {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
};

interface Props {
  restaurants: MapRestaurant[];
  height?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  locationZoom?: { version: number; radiusMiles?: number };
  // One-time initial viewport (e.g. the user's home-state bounds). Applied once
  // when first available; suppresses the auto-fit-to-all-restaurants behavior.
  initialBounds?: GeoBounds | null;
  disableAutoFit?: boolean;
}

interface FitBoundsProps {
  restaurants: MapRestaurant[];
  disabled?: boolean;
}

function FitBounds({ restaurants, disabled }: FitBoundsProps) {
  const map = useMap();

  if (disabled) return null;
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

interface ZoomToUserLocationProps {
  locationZoom: { version: number; radiusMiles?: number };
  userLocation: { latitude: number; longitude: number };
  restaurants: MapRestaurant[];
}

function ZoomToUserLocation({ locationZoom, userLocation, restaurants }: ZoomToUserLocationProps) {
  const map = useMap();
  const lastVersionRef = useRef(-1);

  useEffect(() => {
    if (locationZoom.version <= 0 || locationZoom.version === lastVersionRef.current) return;
    lastVersionRef.current = locationZoom.version;

    if (locationZoom.radiusMiles) {
      const R = locationZoom.radiusMiles;
      const latOff = R / 69.0;
      const lngOff = R / (69.0 * Math.cos((userLocation.latitude * Math.PI) / 180));
      map.fitBounds([
        [userLocation.latitude - latOff, userLocation.longitude - lngOff],
        [userLocation.latitude + latOff, userLocation.longitude + lngOff],
      ]);
    } else {
      const points: [number, number][] = [
        [userLocation.latitude, userLocation.longitude],
        ...restaurants.map(
          (r) => [parseFloat(r.latitude), parseFloat(r.longitude)] as [number, number]
        ),
      ];
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
  }, [locationZoom.version]); // intentional — only zoom when user explicitly taps the button

  return null;
}

function InitialBounds({ bounds }: { bounds: GeoBounds | null | undefined }) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !bounds) return;
    done.current = true;
    map.fitBounds([
      [bounds.low.latitude, bounds.low.longitude],
      [bounds.high.latitude, bounds.high.longitude],
    ]);
  }, [bounds, map]);

  return null;
}

export function RestaurantMap({
  restaurants,
  height = "600px",
  userLocation,
  locationZoom,
  initialBounds,
  disableAutoFit,
}: Props) {
  return (
    <MapContainer center={[39.83, -98.58]} zoom={4} style={{ height, width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds restaurants={restaurants} disabled={disableAutoFit} />
      <InitialBounds bounds={initialBounds} />
      {userLocation && locationZoom && (
        <ZoomToUserLocation
          locationZoom={locationZoom}
          userLocation={userLocation}
          restaurants={restaurants}
        />
      )}
      {userLocation && (
        <CircleMarker
          center={[userLocation.latitude, userLocation.longitude]}
          radius={8}
          pathOptions={{ fillColor: "#3b82f6", fillOpacity: 1, color: "white", weight: 2 }}
        >
          <Popup>
            <p className="font-semibold">You are here</p>
          </Popup>
        </CircleMarker>
      )}
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
              {r.coverPhotoUrl && (
                <img
                  src={r.coverPhotoUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "80px",
                    objectFit: "cover",
                    borderRadius: "4px",
                    marginBottom: "6px",
                  }}
                />
              )}
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
