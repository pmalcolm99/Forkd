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
  const [zoomVersion, setZoomVersion] = useState(0);

  function refresh() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation(loc);
        setZoomVersion((v) => v + 1);
        const entry: StoredEntry = { ...loc, storedAt: Date.now() };
        localStorage.setItem(LOCATION_KEY, JSON.stringify(entry));
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      }
    );
  }

  return { location, isLocating, refresh, zoomVersion };
}
