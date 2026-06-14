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
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    if (value !== undefined) {
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else next.set(key, value);
    }
    if (key !== "page") next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  function resetFilters() {
    // Clear all four filter keys in a single router.replace to avoid stale-searchParams
    // race conditions that would occur from calling updateFilter() four times sequentially.
    const next = new URLSearchParams(searchParams.toString());
    ["status", "state", "cuisineTypeId", "addedByUserId"].forEach((k) => next.delete(k));
    next.set("page", "1");
    router.replace(`?${next.toString()}`);
  }

  return { filters, updateFilter, resetFilters };
}
