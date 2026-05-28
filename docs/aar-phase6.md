# After Action Report — Phase 6: Admin UI & Configuration System

**Date completed:** 2026-05-27
**Commits:** `839b2cc` through `3d6ec43`
**CI:** ✅ All checks green

---

## What was built

Phase 6 delivered the configuration and user-management layer that gates all subsequent AI/import features.

### Core infrastructure

- **AES-256-GCM encryption** (`packages/api/src/crypto.ts`) — lazy `MASTER_KEY` validation, random 12-byte IV per call, typed `CryptoError` with `bad_format` / `auth_failed` kinds. Includes `_resetKeyCache()` for test isolation.
- **Config key registry** (`packages/api/src/config/keys.ts`) — 6 keys: `ai.claude.api_key`, `ai.claude.model` (default: `claude-opus-4-7`), `transcription.api_key`, `transcription.model` (default: `whisper-1`), `google_places.api_key`, `bootstrap_complete`.
- **`getDecryptedConfigValue(key, db)`** (`packages/api/src/config/read.ts`) — server-only helper for Phases 7, 8, and 10 to retrieve plaintext API keys.
- **Graceful shutdown** (`apps/web/src/server/shutdown.ts`) — 10-second drain, DB pool close, `process.exit(0)`. Registered on `SIGTERM` / `SIGINT` at import time. `docker-compose.yml` uses `restart: always` so Docker respawns automatically.
- **`shutdownFn` injected into tRPC context** — mirrors the `fileStore` pattern to avoid circular dependency between `@forkd/api` and `apps/web`.

### tRPC routers

- **`config` router** — `get`, `set` (upsert with validation), `testClaude`, `testWhisper`, `testGooglePlaces`, `restartServer` (ownerProcedure, 500 ms delay before exit).
- **`users` router** — kept `listForFilter`; added `list`, `promoteToAdmin`, `revokeAdmin`, `remove` (all ownerProcedure).

### Admin UI (`/admin`)

Six-tab layout gated by `notFound()` (not redirect) for non-admin/non-owner users:

- **Users** — HeroUI Table with role badges; owner-only promote/revoke/remove actions; remove requires typing the user's first name.
- **AI (Claude)** — API key + model config with inline connection test.
- **Transcription** — Whisper API key + model config with inline connection test.
- **Google Places** — API key config with inline connection test.
- **Backup** — Owner-only placeholder ("Coming in Phase 11").
- **About** — App version, GitHub link, owner-only Restart button with health-check polling.

---

## Issues encountered and fixes

### 1. `node:crypto` in client bundle (Docker build failure)

**Problem:** `packages/shared/src/index.ts` exported `crypto.ts`, which uses `node:crypto`. Client-side pages import `@forkd/shared`, so webpack attempted to bundle `node:crypto` into the browser bundle. The build failed with a module-not-found error in the standalone output.

**Fix:** Moved `crypto.ts` and `crypto.test.ts` from `packages/shared/src/` to `packages/api/src/`. Updated `read.ts` and `config.ts` to import from `"../crypto"`. Removed the export from `packages/shared/src/index.ts`.

**Lesson:** `packages/shared` is imported by Client Components — never export anything that uses Node.js built-ins from it. Server-only code belongs in `packages/api` or behind `import "server-only"`.

### 2. Sign-out page crashing (Next.js 15 RSC restriction)

**Problem:** `apps/web/src/app/sign-out/page.tsx` called `cookies().delete()` inside a Server Component. Next.js 15 forbids cookie writes in RSCs — only Route Handlers and Server Actions can modify cookies. The page threw before clearing the cookie, leaving users with stale session cookies. Observed in Docker logs as three repeated `Error: Cookies can only be modified in a Server Action or Route Handler` errors.

**Fix:** Created `apps/web/src/app/api/auth/sign-out/route.ts` (GET Route Handler) that verifies the HMAC, deletes the DB session, clears the cookie, then redirects to CF Access logout or `/sign-in`. Simplified the sign-out page to `redirect("/api/auth/sign-out")`. Changed the nav "Sign out" link from `<Link>` to `<a>` so the browser makes a real GET request (not a client-side navigation).

**Lesson:** In Next.js App Router, any operation that writes cookies — sign-out, session refresh, cookie clear — must be in a Route Handler or Server Action, not a page component.

### 3. Whisper test returning 400

**Problem:** The `testWhisper` procedure sent a synthetic MP3 generated from raw MPEG1 Layer3 frame bytes (constructed in Python without using a proper encoder). OpenAI's Whisper API returned `400: The audio file could not be decoded or its format is not supported`.

**Fix:** Replaced the MP3 with a proper WAV file (0.5 s, 16 kHz, mono, 16-bit PCM) generated using Python's `wave` standard library module. WAV format is trivially constructed correctly by the standard library. The constant was renamed from `SILENCE_MP3_BASE64` to `SILENCE_WAV_BASE64`. Also improved the Whisper error path to include OpenAI's error message body for future debugging.

**Lesson:** Raw audio frame bytes are not a valid audio container. Use a real encoder or a format with a simple, well-specified header (WAV). When testing against external APIs, always surface the full error body — `API returned 400` is useless without it.

### 4. Python-generated MP3 used as silence.mp3 fixture

The `packages/api/src/external/test-fixtures/silence.mp3` binary file committed in Phase 6 was also generated from raw frames and is therefore non-functional. It is not used at runtime (the embedded base64 constant replaced it), but it's misleading as a source artifact. It can be replaced with a proper file if needed using:

```
python3 -c "import wave,struct,io; b=open('silence.wav','wb'); w=wave.open(b,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(struct.pack('<8000h',*([0]*8000))); w.close()"
```

### 5. Pre-existing `tailwind.config.js` lint failure on CI

**Problem:** The Phase 5 CI run failed because `tailwind.config.js` uses CommonJS (`require`/`module.exports`) and the ESLint config applied TypeScript/ESM rules to it. This was a pre-existing file that had been hidden by turbo cache locally.

**Fix:** Added `"**/tailwind.config.js"` to the ignores array in `eslint.config.js` (committed in Phase 6). CI has been green since.

---

## Key implementation decisions

| Decision                                                     | Reason                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shutdownFn` injected via tRPC context                       | `@forkd/api` cannot import from `apps/web` (wrong dependency direction). Mirrors the existing `fileStore` pattern.                                                                         |
| Silence fixture embedded as base64 constant                  | Next.js standalone output does not copy `packages/` files at runtime — a `fs.readFile` would fail in production.                                                                           |
| Lazy `MASTER_KEY` validation                                 | Prevents import-time crash in test environments that don't set `MASTER_KEY`. Key is validated and cached on first use.                                                                     |
| `notFound()` instead of redirect for admin gate              | Returning 404 doesn't reveal that the URL exists to non-admin users. A redirect to `/sign-in` would confirm the route.                                                                     |
| `Buffer.from(str, "base64")` does not throw on invalid input | Node.js silently returns whatever bytes it can parse. IV (12 bytes) and auth tag (16 bytes) lengths must be validated explicitly in `decrypt()` to produce the correct `bad_format` error. |
| Sign-out as Route Handler, not RSC page                      | Next.js 15 forbids `cookies().set/delete` in RSC pages. Route Handlers have full cookie write access.                                                                                      |

---

## Files added / modified

| Action   | Path                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| Added    | `packages/api/src/crypto.ts` (moved from shared)                               |
| Added    | `packages/api/src/crypto.test.ts` (moved from shared)                          |
| Added    | `packages/api/src/config/keys.ts`                                              |
| Added    | `packages/api/src/config/read.ts`                                              |
| Added    | `packages/api/src/routers/config.ts`                                           |
| Added    | `apps/web/src/server/shutdown.ts`                                              |
| Added    | `apps/web/src/app/api/auth/sign-out/route.ts`                                  |
| Added    | `apps/web/src/app/admin/layout.tsx`                                            |
| Added    | `apps/web/src/app/admin/page.tsx`                                              |
| Added    | `apps/web/src/app/admin/_components/AdminTabs.tsx`                             |
| Added    | `apps/web/src/app/admin/_components/ConfigKeyForm.tsx`                         |
| Added    | `apps/web/src/app/admin/_components/RestartButton.tsx`                         |
| Added    | `apps/web/src/app/admin/users/page.tsx`                                        |
| Added    | `apps/web/src/app/admin/users/_components/UsersTable.tsx`                      |
| Added    | `apps/web/src/app/admin/ai/page.tsx`                                           |
| Added    | `apps/web/src/app/admin/ai/_components/AiConfigForm.tsx`                       |
| Added    | `apps/web/src/app/admin/transcription/page.tsx`                                |
| Added    | `apps/web/src/app/admin/transcription/_components/TranscriptionConfigForm.tsx` |
| Added    | `apps/web/src/app/admin/google-places/page.tsx`                                |
| Added    | `apps/web/src/app/admin/google-places/_components/GooglePlacesConfigForm.tsx`  |
| Added    | `apps/web/src/app/admin/backup/page.tsx`                                       |
| Added    | `apps/web/src/app/admin/about/page.tsx`                                        |
| Modified | `packages/api/src/routers/users.ts`                                            |
| Modified | `packages/api/src/root.ts`                                                     |
| Modified | `packages/api/src/trpc.ts`                                                     |
| Modified | `packages/shared/src/index.ts`                                                 |
| Modified | `packages/db/src/client.ts`                                                    |
| Modified | `packages/db/src/index.ts`                                                     |
| Modified | `apps/web/src/app/api/trpc/[trpc]/route.ts`                                    |
| Modified | `apps/web/src/lib/trpc/server.ts`                                              |
| Modified | `apps/web/src/app/layout.tsx`                                                  |
| Modified | `apps/web/src/app/sign-out/page.tsx`                                           |
| Modified | `apps/web/src/app/restaurants/[id]/page.tsx`                                   |
| Modified | `apps/web/src/app/admin/layout.tsx`                                            |
| Modified | `docker-compose.yml`                                                           |
| Modified | `eslint.config.js`                                                             |

---

## Test counts

| Package         | Tests                            |
| --------------- | -------------------------------- |
| `@forkd/shared` | 19                               |
| `@forkd/api`    | 29 (includes 7 new crypto tests) |
| `@forkd/web`    | 12                               |
| **Total**       | **60**                           |

---

## Prerequisite for next phases

Before Phase 7 (social import), Phase 8 (Google Places), or Phase 10 (AI review) can function, an admin must:

1. Navigate to `/admin` → AI (Claude) tab → paste Anthropic API key → Test connection
2. Navigate to Transcription tab → paste OpenAI API key → Test connection
3. Navigate to Google Places tab → paste Google Places API key → Test connection

Keys are stored AES-256-GCM encrypted in the `app_config` table. Downstream phases retrieve them via `getDecryptedConfigValue(key, db)` from `packages/api/src/config/read.ts`.
