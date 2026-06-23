"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { parseRestaurantFilters, type ListRestaurantsInput } from "@forkd/shared";

export function useRestaurantFilters(): {
  filters: ListRestaurantsInput;
  updateFilter: (key: string, value: string | string[] | undefined) => void;
  resetFilters: () => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseRestaurantFilters(new URLSearchParams(searchParams.toString()));

  function updateFilter(key: string, value: string | string[] | undefined) {
    // window.location.search always reflects the current URL, unlike the closure-captured
    // searchParams which can be stale when called from a debounced effect.
    const next = new URLSearchParams(window.location.search);
    next.delete(key);
    if (value !== undefined) {
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else next.set(key, value);
    }
    if (key !== "page") next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  function resetFilters() {
    const next = new URLSearchParams(window.location.search);
    ["status", "state", "country", "priceLevel", "cuisineTypeId", "addedByUserId"].forEach((k) =>
      next.delete(k)
    );
    next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  return { filters, updateFilter, resetFilters };
}
