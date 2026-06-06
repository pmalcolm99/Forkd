# After Action Report — Phase 8: Google Places Integration

**Date completed:** 2026-06-06
**Commit:** `ed5441f`
**CI:** ✅ All checks green (ci: 45s, docker: 2m33s)

---

## What was built

Phase 8 adds Google Places as the data source for adding restaurants. Instead of typing everything manually, users search by name and location, pick from up to 5 results, and get the form pre-populated with name, address, state, coordinates, website, and Google rating. Any user can also refresh the stored Google rating snapshot at any time from the restaurant detail page.

### Google Places client (`packages/api/src/external/google-places.ts`)

A server-only module using the **Places API (New)** (`places.googleapis.com/v1/…`) with plain `fetch` — no SDK needed. Two exported functions:

- **`searchPlaces(query, db)`** — POSTs to `places:searchText` with a 6-field mask, validates the response with Zod, and returns a `SearchResult[]` (up to 5 entries with placeId, name, formattedAddress, lat/lng, rating, website).
- **`getPlaceRating(placeId, db)`** — GETs `places/{placeId}` with a 2-field mask (`id,rating`), validates, and returns the current numeric rating (or null if the place has no rating).

Both functions follow the Phase 7 adapter contract exactly:

- Read key via `getDecryptedConfigValue("google_places.api_key", db)` — return `{ status: "not_configured" }` if null.
- Return a typed three-way union: `success | not_configured | failed`.
- AbortController 10 s timeout.
- Zod validation before returning data — invalid shapes return `failed`, never throw.
- All failures logged via Pino; the key never appears in logs.

**Critical field mask difference** (a real API gotcha): text search field mask paths require a `places.` prefix (`places.id`, `places.rating`, …), but Place Details field mask paths do **not** (`id`, `rating`). Using the wrong prefix silently returns an empty response or an API error. The comments in the source document this.

### tRPC procedures (added to `restaurants` router)

| Procedure                            | Type     | Auth               | What it does                                                                                                                                                                                    |
| ------------------------------------ | -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurants.googlePlacesConfigured` | query    | protectedProcedure | Returns `{ configured: boolean }` — key presence check only, no key value exposed                                                                                                               |
| `restaurants.searchGooglePlaces`     | query    | protectedProcedure | Accepts `{ query: string }`, calls `searchPlaces`, returns the status union                                                                                                                     |
| `restaurants.refreshGoogleRating`    | mutation | protectedProcedure | Requires a stored `googlePlaceId`; calls `getPlaceRating`; on success writes `googleRating` + `googleRatingFetchedAt`; on failure throws a typed TRPCError, leaving existing snapshot untouched |

`searchGooglePlaces` is a `.query` (not `.mutation`) because it has no side effects — the TanStack Query cache can deduplicate repeated searches for the same string.

### `config.testGooglePlaces` update

The existing stub used the old Places API (`maps.googleapis.com`) with the old field format. It was replaced with a one-liner that calls `searchPlaces("pizza near New York", ctx.db)` from the new client and maps the status union to `{ ok, error }`. No duplication of fetch logic; the admin UI sees identical return types.

### Add-restaurant flow (`apps/web/src/app/restaurants/new/page.tsx`)

Restructured as a two-step client component:

**Step 1 — Search** (only rendered when the Places key is configured):

- Text input + Search button (Enter key also triggers).
- tRPC query with `enabled: false` initially, fired on button press by setting `searchEnabled: true`.
- Results list: name, address, optional rating. Clicking a result builds a `prefill` object and advances to step 2.
- "None of these — enter manually" button skips to step 2 with an empty `prefill`.
- Search step is skipped entirely (never rendered) when `googlePlacesConfigured === false` — no dead UI.

**Step 2 — Form:**

- `<RestaurantForm defaultValues={prefill} …/>` — the existing component, unchanged.
- `prefill` carries `name`, `address`, `state` (extracted from `formattedAddress`), `website`, `googlePlaceId`, `googleRating`, `latitude`, `longitude`.

**US state extraction** is a two-pattern regex: `/\b([A-Z]{2})\s+\d{5}\b/` covers "CO 80214" (ZIP present); `/,\s+([A-Z]{2})(?:,|\s+USA)/` covers addresses without ZIP. The extracted code is validated through `usStateEnum.safeParse` before being passed as a default — if the address format is unexpected, `state` is left undefined and the user fills it in.

### `RestaurantForm.tsx` — no changes needed

The four new fields (`googlePlaceId`, `googleRating`, `latitude`, `longitude`) were added to `createRestaurantInput` in `@forkd/shared`. Because `RestaurantForm` already uses `useZodForm(createRestaurantInput, defaultValues)`, these fields flow through the form invisibly — they're included in the validated submit payload without any new UI elements. TypeScript enforces them automatically.

### Numeric type conversion in the router

Drizzle's `numeric` columns (`latitude`, `longitude`, `googleRating`) accept `string | null` on insert/update but `createRestaurantInput` uses `z.number()` for natural ergonomics in the UI. The `create` and `update` procedures destructure these fields and call `String(value)` before writing to the DB. The `update` procedure additionally guards `!== undefined` before converting — partial updates must leave unset fields as `undefined` so Drizzle does not overwrite existing values with null.

### Refresh button (`apps/web/src/app/restaurants/[id]/_components/RefreshGoogleRatingButton.tsx`)

Client component that:

- Calls `restaurants.refreshGoogleRating` mutation.
- Shows two distinct disabled-with-Tooltip states: "no key configured" vs "no Google Place ID on this restaurant."
- Uses `router.refresh()` on success (RSC revalidation pattern established in Phase 5 — same as `PhotoUploadButton`).
- Shows inline `text-danger` error on failure; existing rating stays visible.

### Restaurant detail page

- Added `caller.restaurants.googlePlacesConfigured()` to the server-side data fetch.
- Added a "Google rating" row to the `<dl>` info section (`parseFloat(row.googleRating) / 5`, with relative timestamp).
- Added `<RefreshGoogleRatingButton>` to the action button row alongside Edit/Delete.

---

## Issues encountered and fixes

### Test mock isolation failure (minor)

The `google-places.test.ts` initial draft did not reset `mockFetch` between the `searchPlaces` and `getPlaceRating` describe blocks. The `getPlaceRating` "not_configured" test asserts `mockFetch` was not called, but the previous describe block's calls accumulated in the spy.

**Fix:** Added `beforeEach(() => { mockFetch.mockClear(); mockGetDecryptedConfigValue.mockReset(); })` to both describe blocks. One-line fix, caught immediately on first `pnpm test` run.

### No other issues

Typecheck, lint, and the Docker build all passed on the first attempt after the test fix. The field mask distinction (with vs without `places.` prefix) was anticipated in the plan and coded correctly from the start.

---

## Key implementation decisions

| Decision                                                               | Reason                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client in `packages/api/src/external/` (not `src/ai/`)                 | Google Places is not an AI service. Separating it keeps `src/ai/` semantically clean for LLM adapters. Both locations are equally server-only.                                                                                                                                 |
| `searchGooglePlaces` as `.query`                                       | Side-effect free. TanStack Query deduplication means the same search query isn't re-fetched if the user triggers search twice.                                                                                                                                                 |
| `refreshGoogleRating` throws `TRPCError` on failure (not status union) | The refresh is triggered by an explicit user action with no fallback path. Throwing surfaces a clean error message to the client's `onError` handler. The `searchGooglePlaces` and status-union pattern is for the add flow, where a failed search falls back to manual entry. |
| Numeric fields as `z.number()` in Zod, `String(value)` in router       | The UI (and Google Places API) works in JS numbers. Converting at the router boundary keeps the client types natural without leaking Drizzle's string-based numeric convention into the API contract.                                                                          |
| `googleRatingFetchedAt` set server-side                                | The timestamp records when the server fetched the rating — not when the user submitted the form. Setting it in the router ensures it's always authoritative.                                                                                                                   |
| State extraction via regex, validated by `usStateEnum.safeParse`       | Google Places addresses are free-form text. The regex handles the common case (US ZIP present, or address ending in state + "USA"). If it fails, `state` is `undefined` and the user fills it in — no silent bad data.                                                         |

---

## Files added / modified

| Action   | Path                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| Added    | `packages/api/src/external/google-places.ts`                                  |
| Added    | `packages/api/src/external/google-places.test.ts`                             |
| Added    | `apps/web/src/app/restaurants/[id]/_components/RefreshGoogleRatingButton.tsx` |
| Modified | `packages/shared/src/schemas/restaurants.ts`                                  |
| Modified | `packages/api/src/routers/restaurants.ts`                                     |
| Modified | `packages/api/src/routers/config.ts`                                          |
| Modified | `apps/web/src/app/restaurants/new/page.tsx`                                   |
| Modified | `apps/web/src/app/restaurants/[id]/page.tsx`                                  |
| Modified | `packages/api/README.md`                                                      |

---

## Test counts

| Package         | Tests                                                           |
| --------------- | --------------------------------------------------------------- |
| `@forkd/shared` | 19                                                              |
| `@forkd/api`    | 42 (added 8 Google Places client tests)                         |
| `@forkd/web`    | 12 (unchanged — no new testable logic in RSC/client components) |
| **Total**       | **73**                                                          |

---

## What Phase 9 (Map view) inherits from here

- `latitude` and `longitude` are now populated on restaurants created via Places search — ready for the Leaflet map pins without any schema work.
- `googlePlaceId` is stored — the detail page URL can surface a "View on Google Maps" link trivially.
- The `searchPlaces` and `getPlaceRating` functions accept a `db` argument following the Phase 7 adapter signature, ready for the Phase 10 BullMQ import worker to call them directly.
