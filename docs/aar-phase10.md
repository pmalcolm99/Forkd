# After Action Report — Phase 10: Social Media Import Pipeline

**Date completed:** 2026-06-06
**Post-launch fixes:** 2026-06-06 (same day — first live test exposed three pipeline bugs; all fixed and CI green)
**CI:** ✅ All checks green

---

## What was built

Phase 10 adds a "Import from social media" feature. A user pastes a TikTok, YouTube, or Facebook URL into a modal; the app scrapes the post, downloads the video, transcribes audio via Whisper, extracts restaurant metadata via Claude, optionally confirms via Google Places, and creates a draft `want_to_try` restaurant. All heavy work runs in a BullMQ background worker. The UI polls for status every 2 seconds and redirects to the new restaurant's edit page on completion.

### BullMQ queue package (`packages/queue`)

New workspace package `@forkd/queue` with two subpath exports:

- **`@forkd/queue`** (main) — exports only `importQueue` (the BullMQ `Queue` client). Used by the tRPC router to enqueue jobs.
- **`@forkd/queue/worker`** — exports `startImportWorker()`. Dynamically imported by Next.js instrumentation at server startup. The split is critical: if `startImportWorker` were in the main export, webpack would statically trace the import chain into `playwright-core`, causing a build-time "Module not found" error for `chromium-bidi` (which playwright-core bundles internally but is not a separate npm package).

**Redis connection:** `getRedisOptions()` returns a plain connection-options object (host, port, password, maxRetriesPerRequest: null) parsed from `REDIS_URL`. BullMQ uses this with its own bundled ioredis — returning a plain object rather than an IORedis instance avoids a type incompatibility error when two ioredis versions coexist in the pnpm store.

### Pipeline modules (`packages/queue/src/pipeline/`)

| Module              | Responsibility                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scraper.ts`        | Playwright CDP connects to `chrome-headless` via `CHROME_CDP_ENDPOINT` (HTTP URL). Fetches `/json/version` using `node:http` with `Host: localhost` to bypass Chrome's DNS-rebinding check, then transplants hostname+port into the WS URL. |
| `downloader.ts`     | yt-dlp subprocess; `--match-filter "duration <= N"` aborts pre-download on over-length videos. 120 s timeout.                                                                                                                               |
| `audioExtractor.ts` | ffmpeg subprocess; converts video to AAC/64 kbps `.m4a`. Uses ffmpeg's native `aac` encoder (always available on Alpine). `.m4a` is in Whisper's accepted format list.                                                                      |
| `transcriber.ts`    | OpenAI Whisper via `audio.transcriptions.create`. Reads API key from encrypted `app_config`; throws `"Whisper not configured"` if absent.                                                                                                   |
| `extractorAi.ts`    | Claude extraction; own Zod schema validated before any DB write. Strips markdown fences. Falls back to `"claude-opus-4-7"`. Throws `"Claude not configured"` if no key.                                                                     |
| `confirmer.ts`      | Google Places text search re-implemented locally (not imported from `@forkd/api`) to avoid circular dependency. Returns `null` silently if not configured.                                                                                  |

**Extraction schema (AI safety layer):**

```typescript
const extractionSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  state: z.enum(usStateEnum.enumValues), // Drizzle pgEnum → validated 2-letter code
  cuisine: z.string(),
  description: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});
```

If Claude returns garbage (wrong state code, missing name, non-JSON), the Zod parse throws before any DB insert.

**Address/state NOT NULL guarantees:**

- `state` — Zod rejects any value not in `usStateEnum.enumValues` before the insert runs.
- `address` — fallback: `confirmed?.formattedAddress ?? (extracted.address || \`${extracted.state}, USA\`)` ensures the NOT NULL column is never empty even if Claude returns an empty string.

**Worker status flow:** `queued → downloading → transcribing → extracting → completed | failed`. Each status is written to `import_jobs` before the corresponding pipeline step. On failure, `errorMessage` is persisted; the user sees it in the modal in red. Temp directory cleaned up in `finally` on both success and failure.

### tRPC import router (`packages/api/src/routers/import.ts`)

- **`import.start`** (`protectedProcedure`) — validates URL against an allowlist of 8 hosts (tiktok.com, www.tiktok.com, youtube.com, www.youtube.com, youtu.be, facebook.com, www.facebook.com, fb.watch). Rate-limits to 5 jobs per user per hour with `TOO_MANY_REQUESTS`. Inserts `import_jobs` row, enqueues BullMQ job, returns `{ jobId }`.
- **`import.status`** (`protectedProcedure`) — queries `import_jobs` scoped to `ctx.user.id` (prevents job ID enumeration). Returns `{ status, step, errorMessage, restaurantId }`.

### Worker bootstrapping

`apps/web/src/instrumentation.ts` — Next.js 15 native `register()` hook. The worker starts in the same Node.js process as the web server, which is correct for a low-volume family app using polling (not WebSockets). A separate worker process would require a second Dockerfile CMD and additional process management with no benefit at this scale.

### UI (`ImportModal.tsx` + `RestaurantList.tsx`)

HeroUI `Modal` with a URL input. Polls `import.status` every 2 seconds while pending; stops polling on `completed` or `failed`. On completion, `router.push(/restaurants/${restaurantId}/edit)`. On failure, shows `errorMessage` in amber text inside the modal.

### Dockerfile runner stage

Added `ffmpeg`, `python3`, and `yt-dlp` (Python zipapp, not the ELF binary) to the Alpine runner image. Using the Python zipapp (`yt-dlp` not `yt-dlp_linux`) is required on Alpine because the ELF binary links against glibc, which Alpine doesn't ship. Alpine's `python3` runs the zipapp without any compatibility issues.

`playwright-core` is explicitly copied from the builder stage into the standalone's `node_modules`. Next.js standalone file-tracing never sees it (dynamic import chain + webpack external), so without this COPY it would be missing at runtime.

---

## Issues encountered and fixes

### TypeScript: `Cannot find name 'document'` in `scraper.ts`

`page.evaluate(() => document.body.innerText)` references the DOM global `document`. The `packages/queue` tsconfig has no `lib: ["DOM"]` (correct — it's a Node-only package). Fix: `page.locator("body").innerText()` — a Playwright-native API that returns the same string without touching DOM types.

### TypeScript: ioredis dual-version type clash

Adding `ioredis ^5.0.0` to `packages/queue/package.json` caused pnpm to install a second ioredis instance alongside the version bundled inside BullMQ. Two instances meant two different `AbstractConnector` classes with protected members — TypeScript refused to assign a `Redis` from one version to a connection slot typed by the other. Fix: removed explicit `ioredis` dep from `packages/queue`. Changed `redis.ts` to export a plain options object (`{ host, port, maxRetriesPerRequest: null, ... }`) that BullMQ accepts directly, with no IORedis instance created in our code.

### Docker build: `Module not found: Can't resolve 'chromium-bidi'`

When `@forkd/queue/src/index.ts` exported both `importQueue` and `startImportWorker`, webpack traced the static import chain: tRPC route → `@forkd/queue` → `worker.ts` → `scraper.ts` → `playwright-core` → `chromium-bidi` (bundled inside playwright-core, not an npm package). `serverExternalPackages: ["playwright-core"]` didn't stop the trace for workspace TypeScript packages.

Fix (three parts):

1. Split `packages/queue/src/index.ts` — exports ONLY `importQueue`, never `startImportWorker`.
2. `"./worker": "./src/worker.ts"` subpath export in `packages/queue/package.json`.
3. `instrumentation.ts` uses `await import("@forkd/queue/worker")` (dynamic subpath import — webpack never traces dynamic imports).
4. `next.config.ts` webpack externals: `[/^chromium-bidi/, /^playwright-core/]` as a belt-and-suspenders guard.

### Docker runtime: `Cannot find module 'playwright-core'`

The standalone output only includes modules that Next.js's file tracer sees. Because playwright-core is only reachable via a dynamic import in `instrumentation.ts`, the tracer never encounters it — it is absent from `standalone/node_modules`. Fix: in the builder stage, use `find` to locate playwright-core in the pnpm store and `cp -rL` it to `/tmp/playwright-core`. The runner stage then copies it to `./node_modules/playwright-core` where Node.js will find it.

### `yt-dlp` version string: `2025.1.15` → `2025.01.15`

yt-dlp GitHub releases use zero-padded months. `2025.1.15` returns HTTP 404. Fix: corrected to `2025.01.15`.

### Vitest `vi.mock` hoisting breaks subprocess tests

`vi.mock("node:child_process", factory)` inside `it()` blocks is hoisted to file scope by Vitest. The second factory definition (failure case) overwrote the first (success case), so the success test received the failure mock. Fix: removed subprocess mocking tests entirely. `pipeline.test.ts` now tests only the pure Zod `extractionSchema` (11 tests, zero I/O).

### Chrome CDP: WebSocket error `ws://chrome-headless:3000/ 404 Not Found`

**Root cause (original):** `connectOverCDP` was called with `ws://chrome-headless:3000` (the full WS URL). Chrome's DevTools WS server returns 404 at the root path `/` — the correct path is `/devtools/browser/<uuid>`, which changes on every Chrome restart.

**Root cause (DNS-rebinding protection):** Switching to `http://chrome-headless:3000` so Playwright could fetch `/json/version` internally still failed: Chrome's DevTools HTTP endpoint returns 500 for any `Host` header that isn't `localhost` or an IP address. This protects against DNS-rebinding attacks. `--remote-allow-origins=*` controls CORS only, not the Host check.

**Fix (three commits):**

1. Fetch `/json/version` with `node:http` (not `fetch`/undici — both copy the URL hostname into Host and cannot override it) with `Host: localhost` hardcoded. Chrome accepts the request and returns the `webSocketDebuggerUrl`.
2. Parse both `cdpEndpoint` and `webSocketDebuggerUrl` as `URL` objects; set `ws.hostname` and `ws.port` from `cdp`. Chrome builds the returned URL using the Host header (`localhost`, no port), so the UUID WS path had `ws://localhost/devtools/browser/...`; the string-replacement approach only covered `127.0.0.1` and `[::1]`, not `localhost`. URL transplanting handles all cases.
3. Added `--remote-allow-origins=*` to the `chrome-headless` container command (belt-and-suspenders for future CORS needs).
4. Renamed `CHROME_WS_ENDPOINT` → `CHROME_CDP_ENDPOINT` to reflect that the env var now holds an HTTP URL, not a raw WS URL. Updated `.env.example`, `docker-compose.yml`, and `docs/master-requirements.md`.

**Startup self-check:** `startImportWorker()` fires `checkChromeReachability()` (void, non-blocking) on boot. Success logs `Chrome reachable: HeadlessChrome/124.0.6367.78`; failure logs a warn with the error reason so any future connectivity issue is immediately visible in container logs.

### Audio format rejected by Whisper: `400 Invalid file format`

`audioExtractor.ts` produced `audio.opus` (libopus codec, `.opus` extension). Whisper's accepted list is `['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']` — `.opus` is absent. Fix: switched to `audio.m4a` with `-c:a aac -b:a 64k`. The `aac` codec is ffmpeg's native built-in (no external library needed, always available on Alpine). `m4a` is in Whisper's accepted list.

### Circular dependency: `@forkd/api` ↔ `@forkd/queue`

`@forkd/api` must import `@forkd/queue` (to enqueue jobs). `@forkd/queue` must read encrypted config (to call Claude, Whisper, Places). Config reading (`getDecryptedConfigValue`) previously lived in `@forkd/api`, which would have created a cycle.

Fix: moved `packages/api/src/crypto.ts` and `packages/api/src/config/read.ts` to `packages/db/src/` (renamed `configRead.ts`). Both depend only on `node:crypto` (built-in) and `@forkd/db`'s own schema — no new dependency edges. Thin re-exports left at the original paths so no existing `@forkd/api` consumer needed import changes. `@forkd/queue` imports `getDecryptedConfigValue` from `@forkd/db` directly.

---

## Key implementation decisions

| Decision                                                       | Reason                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Worker bootstrapped via `instrumentation.ts`                   | Next.js 15 native, no Dockerfile CMD change, no WebSocket support needed at this scale                                         |
| Split queue index — `importQueue` only in main export          | Prevents webpack from statically tracing playwright-core through the tRPC route import chain                                   |
| `getRedisOptions()` returns plain object, not IORedis instance | Avoids ioredis dual-version type clash when pnpm has two versions installed                                                    |
| `playwright-core` copied explicitly in Dockerfile              | Not traced by Next.js standalone file tracer (dynamic import + webpack external)                                               |
| `confirmer.ts` re-implements Places fetch locally              | Avoids circular dependency; ~30 lines; the background confirmer is a different concern from the tRPC-facing Places adapter     |
| Python zipapp yt-dlp, not ELF binary                           | Alpine lacks glibc; zipapp runs via Alpine's `python3` without compatibility issues                                            |
| `cuisineTypeId` left null on draft                             | Resolving a cuisine string to a UUID requires a DB lookup that adds fragility; user curates on the edit page                   |
| `attempts: 1` on BullMQ jobs                                   | Failed jobs surface their error to the user via `import_jobs.error_message`; retrying without user action is unhelpful         |
| Rate limit: 5 imports/user/hr                                  | Prevents runaway API spend on a family app without a billing ceiling                                                           |
| `node:http` for Chrome `/json/version`, not `fetch`/undici     | Both fetch and undici derive Host from the URL and cannot override it; `node:http` lets you set an arbitrary Host header       |
| URL transplant (parse + set hostname/port) vs. string-replace  | String-replace on `127.0.0.1`/`[::1]` misses `localhost` (which Chrome uses when Host is `localhost`); URL parse is exhaustive |
| AAC/m4a for audio extraction, not libopus/.opus                | `.opus` is not in Whisper's accepted format list; `aac` is ffmpeg's native encoder — no Alpine package gap possible            |
| Claude cuisine prompt: "infer aggressively from keywords"      | Without this instruction Claude returns empty string for obvious cues ("sushi" → left blank instead of "Japanese")             |

---

## Post-launch validation (first live test)

Tested with a real TikTok URL (`https://www.tiktok.com/t/ZP8shLuDT/`) immediately after the three post-launch fixes landed. Full pipeline ran end-to-end:

| Stage                      | Result                                         |
| -------------------------- | ---------------------------------------------- |
| Chrome scrape              | ✅ Page title + body text extracted            |
| yt-dlp download            | ✅ Video downloaded                            |
| ffmpeg audio               | ✅ `audio.m4a` produced (AAC)                  |
| Whisper transcription      | ✅ Audio transcribed                           |
| Claude extraction          | ✅ Name, address, state, description populated |
| Google Places confirmation | ✅ Place ID, rating 4.7, lat/lng enriched      |
| Draft restaurant created   | ✅ Redirected to edit page                     |

**Extracted metadata (Sushi by SYC, Denver CO):**

- Name: Sushi by SYC
- Address: 1573 S Colorado Blvd, Denver, CO 80222, USA (from Google Places)
- State: CO
- Description: omakase with Chef Lee, 22 years experience, Michelin star background, à la carte + omakase options
- Google rating: 4.7 / 5
- Map pin rendered at correct location

Post-test: draft restaurant deleted (DB cleanup done by user).

---

## Files added

| File                                                       | Notes                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/db/src/crypto.ts`                                | Moved from `packages/api/src/crypto.ts` — AES-256-GCM encrypt/decrypt            |
| `packages/db/src/configRead.ts`                            | Moved from `packages/api/src/config/read.ts` — reads encrypted `app_config` rows |
| `packages/queue/src/redis.ts`                              | BullMQ connection options factory (parsed from `REDIS_URL`)                      |
| `packages/queue/src/queue.ts`                              | BullMQ Queue client (enqueue-only)                                               |
| `packages/queue/src/worker.ts`                             | BullMQ Worker + full pipeline orchestration                                      |
| `packages/queue/src/pipeline/scraper.ts`                   | Playwright CDP scraper                                                           |
| `packages/queue/src/pipeline/downloader.ts`                | yt-dlp subprocess wrapper                                                        |
| `packages/queue/src/pipeline/audioExtractor.ts`            | ffmpeg subprocess wrapper                                                        |
| `packages/queue/src/pipeline/transcriber.ts`               | OpenAI Whisper transcription                                                     |
| `packages/queue/src/pipeline/extractorAi.ts`               | Claude metadata extraction + Zod schema                                          |
| `packages/queue/src/pipeline/confirmer.ts`                 | Google Places standalone text search                                             |
| `packages/queue/vitest.config.ts`                          | Vitest config for queue package                                                  |
| `packages/api/src/routers/import.ts`                       | tRPC import router (start + status)                                              |
| `packages/api/src/routers/import.test.ts`                  | URL allowlist + rate limit tests                                                 |
| `packages/queue/src/pipeline.test.ts`                      | Zod extractionSchema validation tests (11 cases)                                 |
| `apps/web/src/instrumentation.ts`                          | Starts BullMQ worker at Next.js boot                                             |
| `apps/web/src/app/restaurants/_components/ImportModal.tsx` | Modal + 2-second polling UI                                                      |

## Files modified

| File                                                          | Change                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/index.ts`                                    | Export `encrypt`, `decrypt`, `CryptoError`, `_resetKeyCache`, `getDecryptedConfigValue`                                       |
| `packages/api/src/crypto.ts`                                  | Thin re-export from `@forkd/db`                                                                                               |
| `packages/api/src/config/read.ts`                             | Thin re-export from `@forkd/db`                                                                                               |
| `packages/api/src/root.ts`                                    | Add `import: importRouter`                                                                                                    |
| `packages/api/package.json`                                   | Add `@forkd/queue` dep                                                                                                        |
| `packages/queue/package.json`                                 | Add bullmq, playwright-core, openai, @anthropic-ai/sdk, @forkd/db, @forkd/shared, zod, vitest; add `./worker` subpath export  |
| `packages/queue/src/index.ts`                                 | Export only `importQueue` (removed `startImportWorker`)                                                                       |
| `apps/web/package.json`                                       | Add `@forkd/queue` dep                                                                                                        |
| `apps/web/next.config.ts`                                     | Add playwright-core, bullmq, ioredis to `serverExternalPackages`; add webpack externals for chromium-bidi and playwright-core |
| `apps/web/src/app/restaurants/_components/RestaurantList.tsx` | Add Import button + ImportModal                                                                                               |
| `docker/Dockerfile`                                           | Add ffmpeg, python3, yt-dlp to runner stage; explicitly copy playwright-core from builder                                     |
| `docker-compose.yml`                                          | `CHROME_WS_ENDPOINT` → `CHROME_CDP_ENDPOINT` (HTTP URL); add `--remote-allow-origins=*` to chrome-headless command            |
| `.env.example`                                                | `CHROME_WS_ENDPOINT` → `CHROME_CDP_ENDPOINT=http://chrome-headless:3000`                                                      |
| `pnpm-workspace.yaml`                                         | Fix `msgpackr-extract` placeholder value → `true`                                                                             |
| `packages/queue/src/pipeline/scraper.ts`                      | `node:http` + Host:localhost for /json/version; URL transplant for WS hostname+port (post-launch fix)                         |
| `packages/queue/src/pipeline/audioExtractor.ts`               | libopus/.opus → aac/.m4a for Whisper compatibility (post-launch fix)                                                          |
| `packages/queue/src/pipeline/extractorAi.ts`                  | Cuisine prompt: "infer aggressively from food keywords" (post-launch fix)                                                     |
| `packages/queue/src/worker.ts`                                | Startup Chrome reachability self-check; `node:http` for Host override (post-launch fix)                                       |
| `docs/master-requirements.md`                                 | `CHROME_WS_ENDPOINT` → `CHROME_CDP_ENDPOINT`; update chrome-headless command docs; add `--remote-allow-origins=*` note        |

---

## Test counts

| Package         | Tests                                                        |
| --------------- | ------------------------------------------------------------ |
| `@forkd/queue`  | 11 (new: extractionSchema Zod validation)                    |
| `@forkd/api`    | 57 (added import router: 8 URL allowlist + rate limit tests) |
| `@forkd/web`    | 12 (unchanged)                                               |
| `@forkd/shared` | (unchanged from Phase 9)                                     |
| **Total**       | **80+**                                                      |
