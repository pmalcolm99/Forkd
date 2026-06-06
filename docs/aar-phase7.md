# After Action Report — Phase 7: AI Metadata via Claude

**Date completed:** 2026-05-28
**Commit:** `15659a5`
**CI:** ✅ All checks green

---

## What was built

Phase 7 adds the Anthropic Claude adapter and wires it into the add-restaurant form as an optional, explicitly-triggered suggestion step.

### Anthropic adapter (`packages/api/src/ai/anthropic.ts`)

A thin, server-only wrapper over `@anthropic-ai/sdk` that:

- Reads `ai.claude.api_key` and `ai.claude.model` from the `app_config` table via `getDecryptedConfigValue` — never from env vars at runtime.
- Reads `AI_MAX_TOKENS` (default 4000), `AI_TEMPERATURE` (default 1.0), and `AI_TIMEOUT_MS` (default 300 000 ms) from env vars.
- Sends a structured-output prompt asking Claude to return only a JSON object with exactly two fields: `cuisine` (string) and `description` (1–2 sentences).
- Strips markdown fences (` ```json … ``` `) before parsing, because Claude sometimes wraps JSON in them despite being told not to.
- Validates the response with a Zod schema before returning.
- Returns a typed three-way union: `{ status: "success"; cuisine; description }` | `{ status: "not_configured" }` | `{ status: "failed"; error }`.
- Logs failures via Pino `logger` from `@forkd/shared`. The API key never appears in any log statement.

### tRPC procedures (added to `restaurants` router)

| Procedure                      | Type     | Auth               | What it does                                                                                                                                                        |
| ------------------------------ | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurants.claudeConfigured` | query    | protectedProcedure | Checks `app_config` for the Claude key; returns `{ configured: boolean }`. Available to all signed-in users so the form can toggle the button without admin access. |
| `restaurants.suggestMetadata`  | mutation | protectedProcedure | Accepts `{ name, address?, website? }`; calls the adapter; returns the `AiMetadataResult` union directly.                                                           |

### Add-restaurant form (`RestaurantForm.tsx`)

- A HeroUI `Tooltip` + `Button` ("Suggest cuisine & description with AI") sits between the Description field and the Save button.
- The button is disabled (with the tooltip explaining why) when `claudeConfigured.data?.configured` is false or when the mutation is in-flight.
- On success, the description field is populated directly and the cuisine dropdown is set via case-insensitive match of Claude's returned string against the known cuisine types list (which is already fetched for the dropdown).
- On failure, a `text-danger` note appears below the button; the form remains fully editable and Save still works.

### Dependency

`@anthropic-ai/sdk@0.54.0` added to `packages/api/package.json` only. Not in the root and not in `packages/shared`.

---

## Issues encountered and fixes

### None

Phase 7 was clean. The first `docker compose up --build` after the change succeeded without modification. Typecheck, lint, and all tests passed on the first attempt.

The main decisions that kept this clean were made up-front during planning:

- Keeping the adapter entirely inside `packages/api` (the Phase 6 hard lesson about server-only code in `packages/shared` was already internalized).
- Using `protectedProcedure` (not `adminProcedure`) for `claudeConfigured` so any signed-in user can check configuration state without admin rights.
- Doing cuisine matching client-side so the server procedure only needed to return a plain string.

---

## Key implementation decisions

| Decision                                                         | Reason                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@anthropic-ai/sdk` in `packages/api` only                       | SDK uses Node.js internals. If it were in `packages/shared`, Client Components would pull it into the browser bundle and break the Docker build — the lesson from Phase 6.                                                                                                                                                                   |
| `claudeConfigured` is `protectedProcedure`, not `adminProcedure` | The add-restaurant page is used by all signed-in users. They need to know if AI is available to render the button state correctly. The check reveals only a boolean — not the key itself.                                                                                                                                                    |
| Cuisine matching is done client-side                             | The `suggestMetadata` mutation already returns a raw string. The form already holds the `cuisines` list for the dropdown. Doing a case-insensitive match in `onSuccess` is simpler than a server-side lookup and avoids an extra round-trip. If no match is found, the dropdown stays at "Other / unknown" and the user can select manually. |
| Markdown fence stripping before `JSON.parse`                     | Claude sometimes wraps JSON in ` ```json ``` ` despite explicit instructions not to. Defensive stripping is a one-liner and prevents a class of silent parse failures.                                                                                                                                                                       |
| Three-state return union (`success                               | not_configured                                                                                                                                                                                                                                                                                                                               | failed`) | Callers need to distinguish "key not set" from "key set but call failed" for different UX responses. A boolean `ok` field would lose that distinction. The union is serialised cleanly by tRPC superjson. |
| AI failure never throws from `suggestMetadata`                   | The procedure always returns a result object — never throws a `TRPCError`. The client reads `result.status` and handles each case. This keeps the add-restaurant save path unaffected by AI failures.                                                                                                                                        |

---

## Files added / modified

| Action   | Path                                                          |
| -------- | ------------------------------------------------------------- |
| Added    | `packages/api/src/ai/anthropic.ts`                            |
| Added    | `packages/api/src/ai/anthropic.test.ts`                       |
| Modified | `packages/api/package.json`                                   |
| Modified | `packages/api/src/routers/restaurants.ts`                     |
| Modified | `apps/web/src/app/restaurants/_components/RestaurantForm.tsx` |

---

## Test counts

| Package         | Tests                      |
| --------------- | -------------------------- |
| `@forkd/shared` | 19                         |
| `@forkd/api`    | 34 (added 5 adapter tests) |
| `@forkd/web`    | 12                         |
| **Total**       | **65**                     |

---

## What Phase 8 (Google Places) inherits from here

- `getDecryptedConfigValue` pattern is established — Phase 8's Google Places client will use it identically for `google_places.api_key`.
- The `restaurants` router pattern for adding a lightweight `protectedProcedure` key-presence check alongside the real mutation is reusable for `restaurants.googlePlacesConfigured`.
- Phase 10 (social import) will call `suggestRestaurantMetadata` directly from the BullMQ worker, passing the worker's db instance as the second argument — the adapter signature was designed for this.
