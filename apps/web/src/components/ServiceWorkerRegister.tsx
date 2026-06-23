"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker (public/sw.js) in production only.
 * Dev is skipped so HMR and fresh assets aren't shadowed by the cache.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal — the app still works online.
    });
  }, []);

  return null;
}
