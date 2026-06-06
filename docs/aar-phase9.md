# After Action Report — Phase 9: Map View

**Date completed:** 2026-06-06
**Commit:** `63a82f5` (core Phase 9), `4c26af1` (post-launch polish), `9d4b2ff` (geocode backfill fix)
**CI:** ✅ All checks green on all three commits

---

## What was built

Phase 9 adds an interactive `/map` page that renders all saved restaurants as color-coded Leaflet + OpenStreetMap pins, with the same five filters (status, state, cuisine, added-by, text search) as the restaurant list page. Both pages now share filter logic extracted from inline code into reusable helpers.

A round of post-launch polish (browser-verified) followed the initial commit. All items are listed in the [Post-launch polish](#post-launch-polish) section below.

### Pure filter helpers (`packages/shared`)

- **`parseRestaurantFilters(params: URLSearchParams)`** — pure function that reads the five filter params from a URL search-params object and returns a validated `ListRestaurantsInput`. Extracted from the inline parsing logic that previously lived in `RestaurantList.tsx`. Both the list page and the map page use this, with no duplication.
- **`RESTAURANT_STATUS_PIN_COLORS`** — `Record<RestaurantStatus, string>` mapping each status to a CSS hex color for Leaflet markers. Kept separate from `RESTAURANT_STATUS_COLORS` (HeroUI chip colors) so neither changes behavior.
- **`listRestaurantsInput.pageSize` max raised from 50 → 500** — required so the map page can request all matching restaurants in a single fetch without pagination.

### `RestaurantMap` component (`packages/ui`)

A `"use client"` Leaflet component in the `@forkd/ui` package. Key design decisions:

- Imports `leaflet/dist/leaflet.css` directly at the top of the file (not via automatic injection) — the only approach that survives the Next.js production webpack build.
- Uses **`CircleMarker` with `pathOptions`** for colored markers. The initial implementation used `L.divIcon` with inline-styled `<div>` elements, but browser testing revealed that Leaflet wraps `divIcon` content in a host `<div>` whose CSS overrides the inner `background-color`, causing all markers to render as the default blue regardless of status. `CircleMarker` with `pathOptions: { fillColor, fillOpacity, color, weight }` is the canonical react-leaflet pattern for status-colored markers — no HTML wrapper, no CSS override.
- Accepts an optional `height?: string` prop (default `"600px"`) so the component can double as a 280 px mini-map on the detail page.
- A `FitBounds` child component (uses `useMap()`, must live inside `MapContainer`) handles three cases: zero pins → US-centered default view, one pin → `setView` at zoom 13, two or more pins → `fitBounds` with 40 px padding.
- Accepts `MapRestaurant[]` as props (already filtered to records with coordinates); does no data fetching.
- Consumed via `next/dynamic({ ssr: false })` wherever it appears — required because Leaflet reads `window` at import time.

### Shared React hook and filter controls (`apps/web`)

- **`useRestaurantFilters`** (`src/lib/useRestaurantFilters.ts`) — wraps `parseRestaurantFilters` with `useSearchParams`/`useRouter` to give both pages an identical `{ filters, updateFilter }` API.
- **`RestaurantFilterControls`** (`src/components/RestaurantFilterControls.tsx`) — the five filter controls extracted from `RestaurantList.tsx` as a shared component.
- `RestaurantList.tsx` refactored to use both. Table, pagination, and data-fetching logic are unchanged.
- "Map view" / "List view" toggle buttons added to each page's header.

### `/map` page (`apps/web/src/app/map/`)

- `page.tsx` — thin RSC with a Suspense boundary.
- `_components/MapClientWrapper.tsx` — `"use client"` component that fetches restaurants with `pageSize: 500`, splits results into those with and without coordinates, shows a count notice when any are hidden due to missing coordinates, and renders `DynamicMap` (Leaflet loaded with `ssr: false`).

### Detail page additions

- **Amber notice** when `latitude` or `longitude` is null: "No map coordinates — use 'Refresh metadata' to fetch them so this restaurant appears on the map."
- **Mini-map** (280 px) rendered below the info card when both `latitude` and `longitude` are non-null, via a `DetailMap` client component (`_components/DetailMap.tsx`) that dynamically imports `RestaurantMap`.

---

## Post-launch polish

All items below were browser-verified in production after the initial Phase 9 commit.

### 1. Map pin colors — `L.divIcon` → `CircleMarker`

**Root cause:** `L.divIcon` wraps the provided HTML in a Leaflet-controlled `<div>` with its own CSS (notably `background: transparent` and a default icon class). The inner `<div>`'s `background-color` inline style is overridden by Leaflet's stylesheet, causing every marker to render as the default blue.

**Fix:** Rewrote `RestaurantMap` to use `CircleMarker` with `pathOptions: { fillColor: RESTAURANT_STATUS_PIN_COLORS[r.status], fillOpacity: 1, color: "white", weight: 2 }`. This is an SVG circle element — no HTML wrapper, no CSS class conflict. Status colors now render correctly in all environments.

**Status color spec (§3.6):**
| Status | Hex | Tailwind |
|---|---|---|
| `want_to_try` | `#6b7280` | gray-500 |
| `been_loved` | `#22c55e` | green-500 |
| `been_okay` | `#f59e0b` | amber-500 |
| `been_disliked` | `#ef4444` | red-500 |
| `permanently_closed` | `#111827` | near-black |

### 2. "Refresh metadata" — 2-step geocode backfill

**Gap identified:** The spec (§3.4 / §3.7) didn't explicitly cover restaurants that have a name and address but no stored `google_place_id` — which applies to any restaurant added before Phase 8 was wired. The original `refreshGoogleRating` mutation threw a `BAD_REQUEST` error for these, and the button was disabled. Thai House was the real-world case: added with a full address but no place_id.

**Fix (commit `9d4b2ff`):** Extended `refreshGoogleRating` into a 2-step flow:

1. If `google_place_id` is null: call `searchPlaces("${name}, ${address ?? state}", db)`, take the top result, and in one write persist `googlePlaceId` + `latitude` + `longitude` + `googleRating`. The text-search response already includes all four fields — no second Places Details call needed.
2. If `google_place_id` is already stored: the existing `getPlaceRating` path runs unchanged.

`RefreshGoogleRatingButton` now has no `googlePlaceId` prop and is **enabled** for any restaurant whenever Google Places is configured. The only disabled state is "Configure Google Places API key in admin settings."

**Production result:** Thai House — `place_id`, `lat/lng`, and `googleRating: 4.2` all populated from a single button click. Amber notice disappeared, mini-map appeared with a green pin. `/map` now shows Thai House correctly near Arvada, CO.

### 3. Button rename: "Refresh Google rating" → "Refresh metadata"

`RefreshGoogleRatingButton.tsx` label updated to match what the mutation now does (rating + coordinates + place_id lookup). The amber detail-page notice already referenced "Refresh metadata" so they now match.

### 4. Real top nav (HeroUI Navbar)

Replaced the bare `<nav>` (two plain underlined links) in `layout.tsx` with a proper `Header` client component (`src/components/Header.tsx`):

- Forkd wordmark linking to `/restaurants`
- Restaurants / Map nav links with active-route highlighting via `usePathname()`
- User dropdown (Admin link shown only when `isAdmin || isOwner`, Sign out)
- Mobile hamburger menu below 640 px with all links repeated

`layout.tsx` now also fetches `me.firstName` to display the user's name in the dropdown trigger.

### 5. Mobile card view for `/restaurants`

Below the `sm` breakpoint, the HeroUI `Table` is hidden (`hidden sm:block`) and replaced with a stacked card list (`sm:hidden`). Each card shows: thumbnail/placeholder, name (truncated), cuisine + state, status chip, and family-rating chip. Avoids horizontal scroll entirely — the user's strong stated preference.

### 6. Photo thumbnail placeholder

Replaced the blank `<div className="bg-gray-100">` with a centered `lucide-react` `Utensils` icon (`h-5 w-5 text-gray-400`) on both the table thumbnail and the mobile card thumbnail.

### 7. Date format consistency

Admin Users table "Joined" column: replaced `u.createdAt.toLocaleDateString()` with `formatRelativeTime(u.createdAt)` (consistent with the rest of the app). The absolute date is preserved in a `title` attribute for hover access.

### 8. Status filter multi-select default

The Status select now shows all five statuses visually selected when no filter is active (`selectedKeys={new Set(filters.status ?? ALL_STATUSES)}`). When the user selects all five explicitly, the filter is cleared from the URL (treated as "no filter") rather than appending all five values. `ALL_STATUSES = restaurantStatusEnum.options`.

### 9. Detail page description `max-w-prose`

The description `<dd>` in the restaurant info card gets `className="max-w-prose"` so it doesn't stretch to the full container width on wide screens.

### 10. Mini-map on detail page

`DetailMap` (`_components/DetailMap.tsx`) is a thin `"use client"` wrapper that dynamically imports `RestaurantMap` with `ssr: false` and renders it at `height="280px"` with a single pin. It appears below the info card on the detail page whenever `row.latitude` and `row.longitude` are both non-null. Wrapped in `<div className="overflow-hidden rounded-lg border">` for visual consistency.

---

## Issues encountered and fixes

### TypeScript `noUncheckedIndexedAccess` in `FitBounds`

`"noUncheckedIndexedAccess": true` in `tsconfig.base.json` means `arr[0]` has type `T | undefined` even after a `arr.length === 1` guard. Fix: `const r = restaurants[0]; if (r) map.setView(...)`.

### `@forkd/ui` not in `apps/web` dependencies

`next/dynamic` and the type import from `@forkd/ui` both failed because the web app's `package.json` didn't declare the workspace dependency. Fix: added `"@forkd/ui": "workspace:*"`.

### `next/dynamic` generic required for named-export pattern

Without the explicit generic, `dynamic(() => import("@forkd/ui").then(m => m.RestaurantMap), { ssr: false })` returns a component typed as `{}`. Fix: `dynamic<{ restaurants: MapRestaurant[]; height?: string }>(...)`.

### Map pin colors rendering as default blue

Root cause and fix described in [Post-launch polish §1](#1-map-pin-colors--ldivicon--circlemarker) above.

---

## Key implementation decisions

| Decision                                                 | Reason                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `leaflet/dist/leaflet.css` imported at top of component  | Only pattern that survives the Next.js production webpack build                                                                        |
| `CircleMarker` + `pathOptions`, not `L.divIcon`          | `divIcon` host wrapper overrides inner `background-color`; `CircleMarker` is an SVG element with no wrapper CSS conflict               |
| `FitBounds` as a child component                         | `useMap()` must be called inside `MapContainer`; child component is the correct react-leaflet v5 pattern for imperative map operations |
| `parseRestaurantFilters` in `packages/shared`            | Pure function, no React dep — fully testable with Vitest, reusable in future non-React contexts (e.g. BullMQ workers)                  |
| `RestaurantFilterControls` in `apps/web/src/components/` | Imports HeroUI and `@forkd/shared`; placing it in `packages/ui` would create a circular dependency                                     |
| `pageSize: 500` in the map query                         | A map shows all results; paginating makes no sense                                                                                     |
| `transpilePackages: ["@forkd/ui"]` in `next.config.ts`   | Required for Next.js to process TypeScript source and CSS imports from a workspace package with no pre-built output                    |
| 2-step metadata refresh (search → details)               | Restaurants added before Phase 8 have no `google_place_id`; text search captures it in one API call and also returns lat/lng + rating  |

---

## Files added / modified

| Action   | Path                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| Added    | `packages/ui/src/RestaurantMap.tsx`                                           |
| Modified | `packages/ui/src/index.ts`                                                    |
| Modified | `packages/ui/package.json`                                                    |
| Modified | `packages/ui/tsconfig.json`                                                   |
| Modified | `packages/ui/README.md`                                                       |
| Added    | `packages/shared/src/parseRestaurantFilters.ts`                               |
| Added    | `packages/shared/src/restaurantStatus.test.ts`                                |
| Added    | `packages/shared/src/parseRestaurantFilters.test.ts`                          |
| Modified | `packages/shared/src/restaurantStatus.ts`                                     |
| Modified | `packages/shared/src/schemas/restaurants.ts`                                  |
| Modified | `packages/shared/src/index.ts`                                                |
| Added    | `apps/web/src/lib/useRestaurantFilters.ts`                                    |
| Added    | `apps/web/src/components/RestaurantFilterControls.tsx`                        |
| Added    | `apps/web/src/components/Header.tsx`                                          |
| Modified | `apps/web/src/app/layout.tsx`                                                 |
| Modified | `apps/web/src/app/restaurants/_components/RestaurantList.tsx`                 |
| Modified | `apps/web/src/components/RestaurantFilterControls.tsx`                        |
| Added    | `apps/web/src/app/map/page.tsx`                                               |
| Added    | `apps/web/src/app/map/_components/MapClientWrapper.tsx`                       |
| Added    | `apps/web/src/app/restaurants/[id]/_components/DetailMap.tsx`                 |
| Modified | `apps/web/src/app/restaurants/[id]/_components/RefreshGoogleRatingButton.tsx` |
| Modified | `apps/web/src/app/restaurants/[id]/page.tsx`                                  |
| Modified | `apps/web/src/app/admin/users/_components/UsersTable.tsx`                     |
| Modified | `apps/web/next.config.ts`                                                     |
| Modified | `apps/web/package.json`                                                       |
| Modified | `packages/api/src/external/google-places.ts`                                  |
| Modified | `packages/api/src/external/google-places.test.ts`                             |
| Modified | `packages/api/src/routers/restaurants.ts`                                     |

---

## Test counts

| Package         | Tests                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@forkd/shared` | 29 (added 10: 5 status-color tests, 5 filter-parsing tests)                                                                |
| `@forkd/api`    | 43 (updated 3 existing google-places tests to assert `latitude`/`longitude` fields; added 1 new test for location present) |
| `@forkd/web`    | 12 (unchanged)                                                                                                             |
| **Total**       | **84**                                                                                                                     |

---

## Test data state (end of session)

| Restaurant  | ID         | lat/lng                       | google_place_id | Google rating |
| ----------- | ---------- | ----------------------------- | --------------- | ------------- |
| Casa Bonita | `c7211dcd` | ✅ populated                  | ✅              | 3.9           |
| Thai House  | `4b325e48` | ✅ backfilled via text search | ✅ captured     | 4.2           |
| Test        | `f2970080` | ❌ no coords                  | ❌              | —             |

Test is manually added with no geocodable address; it is intentionally excluded from the map and counted in the "N restaurants not shown" notice.

---

## What Phase 10 (social-media import) inherits from here

- **`parseRestaurantFilters`** — pure shared utility callable in BullMQ workers without browser dependencies.
- **`RESTAURANT_STATUS_PIN_COLORS`** and **`RESTAURANT_STATUS_LABELS`** — in `@forkd/shared`, ready for any future UI or reporting use.
- **`useRestaurantFilters`** hook — if Phase 10 adds a filter-aware import-status page, reuse directly.
- **`listRestaurantsInput.pageSize` max is 500** — any future bulk-fetch use case can request up to 500 restaurants without a schema change.
- **`RestaurantFilterControls`** is extracted and shared — embeddable with no duplication.
- **`refreshGoogleRating` 2-step pattern** — the text-search-then-details approach is a useful model for any future "find and enrich" flows in the import pipeline.
