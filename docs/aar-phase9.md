# After Action Report — Phase 9: Map View

**Date completed:** 2026-06-06
**Commit:** `63a82f5`
**CI:** ✅ All checks green (ci: 47s, docker: 2m33s)

---

## What was built

Phase 9 adds an interactive `/map` page that renders all saved restaurants as color-coded Leaflet + OpenStreetMap pins, with the same five filters (status, state, cuisine, added-by, text search) as the restaurant list page. Both pages now share filter logic extracted from inline code into reusable helpers.

### Pure filter helpers (`packages/shared`)

- **`parseRestaurantFilters(params: URLSearchParams)`** — pure function that reads the five filter params from a URL search-params object and returns a validated `ListRestaurantsInput`. Extracted from the inline parsing logic that previously lived in `RestaurantList.tsx`. Both the list page and the map page use this, with no duplication.
- **`RESTAURANT_STATUS_PIN_COLORS`** — new `Record<RestaurantStatus, string>` mapping each status to a CSS hex color for Leaflet `divIcon` pins. Kept separate from the existing `RESTAURANT_STATUS_COLORS` (which maps to HeroUI chip colors) so neither changes behavior.
- **`listRestaurantsInput.pageSize` max raised from 50 → 500** — required so the map page can request all matching restaurants in a single fetch without pagination.

### `RestaurantMap` component (`packages/ui`)

A `"use client"` Leaflet component in the new `@forkd/ui` package. Key design decisions:

- Imports `leaflet/dist/leaflet.css` directly at the top of the file (not via automatic injection) — the only approach that survives the Next.js production webpack build.
- Uses `L.divIcon` with an inline-styled `<div>` for markers, avoiding Leaflet's broken default PNG marker path in bundled environments.
- A `FitBounds` child component (uses `useMap()` and must live inside `MapContainer`) handles three cases: zero pins → US-centered default view, one pin → `setView` at zoom 13, two or more pins → `fitBounds` with 40 px padding.
- Accepts `MapRestaurant[]` as props (already filtered to records that have coordinates); does no data fetching.
- Consumed via `next/dynamic({ ssr: false })` in the map page's client wrapper — required because Leaflet reads `window` at import time.

### Shared React hook and filter controls (`apps/web`)

- **`useRestaurantFilters`** (`src/lib/useRestaurantFilters.ts`) — wraps `parseRestaurantFilters` with `useSearchParams`/`useRouter` to give both pages an identical `{ filters, updateFilter }` API.
- **`RestaurantFilterControls`** (`src/components/RestaurantFilterControls.tsx`) — the five filter controls extracted from `RestaurantList.tsx` as a shared component. Accepts `filters`, `updateFilter`, `cuisines`, `users`, `searchValue`, and `onSearchValueChange` as props; the search debounce stays in the parent.
- `RestaurantList.tsx` was refactored to use both of the above. The table, pagination, and data-fetching logic are unchanged.
- A "Map view" button was added to the list page header; a "List view" button appears in the map page header.

### `/map` page (`apps/web/src/app/map/`)

- `page.tsx` — thin RSC with a Suspense boundary, identical in structure to `restaurants/page.tsx`.
- `_components/MapClientWrapper.tsx` — `"use client"` component that fetches restaurants with `pageSize: 500`, splits results into those with and without coordinates, shows a notice when any are hidden due to missing coordinates, and renders `DynamicMap` (the Leaflet component loaded with `ssr: false`).

### Detail page note

When a restaurant's `latitude` or `longitude` is null, a small amber notice appears on the detail page encouraging the user to use "Refresh metadata" so the restaurant appears on the map. No new DB columns or data fetching were added.

---

## Issues encountered and fixes

### TypeScript `noUncheckedIndexedAccess` in `FitBounds`

The `tsconfig.base.json` has `"noUncheckedIndexedAccess": true`, which means `arr[0]` has type `T | undefined` even after a `arr.length === 1` check. TypeScript does not narrow array access via length checks.

**Fix:** Changed `const r = restaurants[0]; map.setView(...)` to `const r = restaurants[0]; if (r) map.setView(...)`. One-line fix.

### `@forkd/ui` not in `apps/web` dependencies

`next/dynamic` and the type import from `@forkd/ui` both failed because the web app's `package.json` didn't declare the workspace dependency.

**Fix:** Added `"@forkd/ui": "workspace:*"` to `apps/web/package.json` and ran `pnpm install`.

### `next/dynamic` generic required for named-export pattern

`dynamic(() => import("@forkd/ui").then(m => m.RestaurantMap), { ssr: false })` returns an untyped component when the generic is omitted. TypeScript reported the props as `{}`.

**Fix:** Used the explicit generic: `dynamic<{ restaurants: MapRestaurant[] }>(...)`.

### No other issues

Lint, typecheck, all 83 tests, and the Docker build all passed cleanly after the three fixes above.

---

## Key implementation decisions

| Decision                                                                    | Reason                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leaflet/dist/leaflet.css` imported at top of component                     | The only pattern that survives the Next.js production webpack build. Automatic CSS injection works in dev but fails in the Docker production build.                                                                                                        |
| `L.divIcon` with inline styles, not default PNG markers                     | Leaflet's default markers rely on image paths that break when bundled. `divIcon` avoids the path issue entirely and allows per-status color via inline `background-color`.                                                                                 |
| `FitBounds` as a child component using `useMap()`                           | `useMap()` must be called inside a `MapContainer`. A child component is the correct pattern for imperative map operations in react-leaflet v5.                                                                                                             |
| `parseRestaurantFilters` in `packages/shared`                               | Pure function with no React dependency — fully testable with Vitest and reusable in future non-React contexts (e.g. a BullMQ worker that needs to validate filter state).                                                                                  |
| Filter controls extracted to `apps/web/src/components/` (not `packages/ui`) | The filter controls import HeroUI and `@forkd/shared` schemas; placing them in `packages/ui` would create a circular dependency chain. `apps/web/src/components/` is the correct boundary for Next.js/HeroUI-coupled components shared within the web app. |
| `pageSize: 500` in the map query                                            | A map shows all results; paginating makes no sense. The `listRestaurantsInput` max was raised from 50 to 500 to support this. The list page still defaults to 20 — no behavior change there.                                                               |
| `transpilePackages: ["@forkd/ui"]` in `next.config.ts`                      | Required for Next.js to process the TypeScript source and CSS imports from a workspace package that has no pre-built output.                                                                                                                               |

---

## Files added / modified

| Action   | Path                                                          |
| -------- | ------------------------------------------------------------- |
| Added    | `packages/ui/src/RestaurantMap.tsx`                           |
| Modified | `packages/ui/src/index.ts`                                    |
| Modified | `packages/ui/package.json`                                    |
| Modified | `packages/ui/tsconfig.json`                                   |
| Modified | `packages/ui/README.md`                                       |
| Added    | `packages/shared/src/parseRestaurantFilters.ts`               |
| Added    | `packages/shared/src/restaurantStatus.test.ts`                |
| Added    | `packages/shared/src/parseRestaurantFilters.test.ts`          |
| Modified | `packages/shared/src/restaurantStatus.ts`                     |
| Modified | `packages/shared/src/schemas/restaurants.ts`                  |
| Modified | `packages/shared/src/index.ts`                                |
| Added    | `apps/web/src/lib/useRestaurantFilters.ts`                    |
| Added    | `apps/web/src/components/RestaurantFilterControls.tsx`        |
| Modified | `apps/web/src/app/restaurants/_components/RestaurantList.tsx` |
| Added    | `apps/web/src/app/map/page.tsx`                               |
| Added    | `apps/web/src/app/map/_components/MapClientWrapper.tsx`       |
| Modified | `apps/web/src/app/restaurants/[id]/page.tsx`                  |
| Modified | `apps/web/next.config.ts`                                     |
| Modified | `apps/web/package.json`                                       |

---

## Test counts

| Package         | Tests                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| `@forkd/shared` | 29 (added 10: 5 status-color tests, 5 filter-parsing tests)                           |
| `@forkd/api`    | 42 (unchanged)                                                                        |
| `@forkd/web`    | 12 (unchanged — Leaflet/RSC/client components not unit-tested, per Phase 8 precedent) |
| **Total**       | **83**                                                                                |

---

## What Phase 10 (social-media import) inherits from here

- **`parseRestaurantFilters`** is now a pure shared utility. The BullMQ import worker (Phase 10) may need to validate or apply filter parameters — this function can be called server-side without any browser dependencies.
- **`RESTAURANT_STATUS_PIN_COLORS`** and **`RESTAURANT_STATUS_LABELS`** are both in `@forkd/shared`, ready for any future UI or reporting use by the import pipeline.
- **`useRestaurantFilters`** hook is in `apps/web/src/lib/` — if Phase 10 adds a filter-aware import-status page, it can reuse this hook directly.
- **`listRestaurantsInput.pageSize` max is now 500** — any future bulk-fetch use case can request up to 500 restaurants in one call without a schema change.
- The `RestaurantFilterControls` component is extracted and shared — if Phase 10 adds UI for viewing import results alongside the restaurant list, it can embed the same filter controls with no duplication.
