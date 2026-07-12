"use client";

import { useState } from "react";

const LOCATION_KEY = "forkd_user_location";
const TTL_MS = 20 * 60 * 1000; // 20 minutes

type StoredEntry = { latitude: number; longitude: number; storedAt: number };

function readStored(): { latitude: number; longitude: number } | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredEntry;
    if (Date.now() - s.storedAt < TTL_MS) {
      return { latitude: s.latitude, longitude: s.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export function useUserLocation() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
    readStored
  );
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomVersion, setZoomVersion] = useState(0);

  function refresh() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location isn't available on this device.");
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation(loc);
        setZoomVersion((v) => v + 1);
        const entry: StoredEntry = { ...loc, storedAt: Date.now() };
        try {
          localStorage.setItem(LOCATION_KEY, JSON.stringify(entry));
        } catch {
          // ignore storage failures (private mode / quota) — location still works in-session
        }
        setIsLocating(false);
      },
      (err) => {
        // Without surfacing this, a denied/timed-out request looks like a dead button.
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied."
            : "Couldn't get your location. Try again."
        );
        setIsLocating(false);
      },
      // timeout is essential: the default is Infinity, so on mobile the request can
      // hang forever waiting for a GPS fix, which made the button appear dead until
      // a full page reload. maximumAge:0 forces a fresh fix on every tap (a true refresh).
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  }

  // Recenter on the already-known location without a new GPS request (no prompt).
  function focus() {
    if (location) setZoomVersion((v) => v + 1);
  }

  return { location, isLocating, error, refresh, focus, zoomVersion };
}
