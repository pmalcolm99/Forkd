"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { filterSetToSearchParams, type FilterSet } from "@forkd/shared";

// If any of these are present in the URL, the user navigated with explicit
// filters — don't override with their saved defaults.
const FILTER_KEYS = [
  "status",
  "state",
  "country",
  "priceLevel",
  "cuisineTypeId",
  "addedByUserId",
  "sort",
  "search",
];

/**
 * On first load with a bare URL, apply the user's saved default filters for the
 * page by replacing the query string. One-shot; respects any explicit URL filters.
 * `ready` gates until the user's profile has loaded.
 */
export function useApplyDefaultFilters(defaults: FilterSet | null | undefined, ready: boolean) {
  const router = useRouter();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !ready) return;
    applied.current = true;
    if (!defaults || Object.keys(defaults).length === 0) return;
    const current = new URLSearchParams(window.location.search);
    if (FILTER_KEYS.some((k) => current.has(k))) return;
    const params = filterSetToSearchParams(defaults);
    params.set("page", "1");
    router.replace(`?${params.toString()}`);
  }, [ready, defaults, router]);
}
