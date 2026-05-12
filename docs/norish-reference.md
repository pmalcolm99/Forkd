# Norish Reference Document

> **Purpose:** This document is the architectural reference for the Family Restaurant Tracker project. Norish is the open-source application whose patterns and structure we will reuse. Always consult this document before designing any new feature in our app — if Norish has already solved a similar problem, we should adapt its solution rather than build from scratch.
>
> **Source:** https://github.com/norish-recipes/norish (license: AGPL-3.0)
> **Norish version referenced:** `0.18.3-beta` (per `package.json` on the `main` branch)
> **Compiled from:** the project's `README.md`, root `package.json`, public GitHub repo listing, and release notes. A few items below are inferred from standard Turborepo/Next.js convention where the underlying file could not be fetched directly; those are flagged with **(inferred)**.

---

## 1. Project Overview

Norish is a real-time, self-hosted recipe application designed for families and households to share a single recipe catalogue, plan meals together, and maintain shared grocery lists. The author built it because existing options (Mealie, Tandoor) did not meet their bar for aesthetics and day-to-day ease of use.

**Why Norish is the right reference for our restaurant app:**

- **Same shape of product.** Norish is a private, household-scoped catalogue of items (recipes), with multiple users contributing, rating, and editing entries. Our restaurant tracker is the same shape: a private catalogue, multiple family members, ratings and notes, AI-assisted import. The data model is genuinely close.
- **Same deployment model.** Self-hosted, Docker Compose, single-binary-ish footprint, designed to live on a small home server behind a reverse proxy / tunnel. This matches our Cloudflare Tunnel + Cloudflare Access plan exactly.
- **Same core technical concerns already solved.** Norish has already solved: first-user bootstrap, OIDC/SSO integration, role-based permissions, an admin settings UI for runtime configuration, an AI-assisted import pipeline, a video-transcription pipeline using a headless Chrome container plus yt-dlp plus Whisper, and PWA installability. These are exactly the hard problems on our requirements doc.
- **Modern, current stack.** Next.js 16 App Router, React 19, Drizzle ORM, tRPC, Better Auth, PostgreSQL, Redis — this is the stack we would have chosen anyway, and Norish proves it can be made to fit on a single Docker Compose file.

The practical implication: we should treat Norish as the architectural starting point. We adopt its monorepo layout, its container topology, its env-var conventions, its bootstrap-then-admin-UI configuration pattern, and its import pipeline shape. We replace its domain model (recipes → restaurants) and we strip the parts we do not need (households, CalDAV, recurring groceries, mobile app for v1).

---

## 2. Tech Stack

The following list comes from the README's Tech Stack section and the dependencies referenced in `package.json`. Every entry includes a one-line note on what it does and why it matters for our restaurant app.

**Language and tooling**

- **TypeScript** — Strongly-typed JavaScript. Used everywhere in Norish (the GitHub language breakdown shows the repo is 99% TypeScript). **For us:** TypeScript throughout, no plain JS. This is non-negotiable per our coding standards.
- **pnpm 10.33.2** — Fast, disk-efficient package manager that supports workspaces. **For us:** we'll use pnpm. Do not use npm or yarn — Norish's lockfile and workspace configuration are pnpm-specific.
- **Turborepo (`turbo`)** — Monorepo build orchestrator that runs scripts (`dev`, `build`, `test`, `lint`) in parallel across workspace packages and caches results. **For us:** Turbo lets us split code into `apps/` (the web app) and `packages/` (shared db schema, shared types, etc.) without duplication.
- **Prettier + ESLint** — Code formatting and linting. **For us:** adopt the same config so Claude Code's output stays consistent.
- **Vitest** — Test runner. **For us:** same. We'll add tests as we go.

**Frontend — web (`@norish/web`)**

- **Next.js 16 (App Router)** — Full-stack React framework. Acts as both frontend and backend (API routes). **For us:** core of the application. The App Router (`app/` directory) is how routing and server components work.
- **React 19** — UI library. **For us:** same.
- **HeroUI v2** — Pre-built React component library (buttons, modals, tables, forms). It is the descendant of NextUI. **For us:** adopt it. This saves us from hand-writing every input and modal.
- **Tailwind CSS v4** — Utility-first CSS framework. **For us:** same. Pairs natively with HeroUI.
- **Framer Motion (`motion`)** — Animation library. **For us:** optional but nice for polish (page transitions, list animations).
- **TanStack Query** — Client-side data-fetching and caching library. Manages server state in React (loading, error, refetch, optimistic updates). **For us:** same. Used in tandem with tRPC.

**Frontend — mobile (`@norish/mobile`)** — Norish has a separate Expo / React Native mobile workspace. **For us:** **skip for v1.** Our requirements call for a PWA, not a native mobile app. We can add Expo later if we ever want it; for now the PWA is enough.

**Backend (lives inside `@norish/web` and its sibling packages)**

- **Node.js custom server (`server.ts` at repo root)** — Norish does not run on the default Next.js server. Instead it boots a custom Node server that wraps Next, which lets it (a) attach WebSocket support, (b) run background jobs, (c) supervise the embedded Python parser process. **For us:** we'll do the same. We need it for the social-media import job queue and probably for the Google Places refresh.
- **tRPC** — End-to-end typesafe RPC between frontend and backend. Instead of writing REST endpoints by hand, you write a server function and call it directly from the client with full TypeScript types. **For us:** same. This dramatically reduces the surface area of bugs.
- **Better Auth** — Modern authentication library for Node/TypeScript. Handles sessions, OAuth providers, OIDC, password auth, account linking, and an admin-settable provider configuration. **For us:** same — see Section 5.
- **Pino** — Fast structured JSON logger. **For us:** same.
- **Redis (client + connection)** — In-memory data store. Norish uses it for two things: real-time event fanout (so when one family member edits a recipe, the others see it instantly) and as the backing store for the BullMQ job queue. **For us:** same. Real-time sync is less critical for us, but we'll need the job queue for social media imports.
- **BullMQ** — Redis-backed job queue for background work. **For us:** essential. The social media import pipeline (download → transcribe → AI extract) is a slow multi-step process that must run out-of-band from the user's HTTP request.

**Database (`@norish/db`)**

- **PostgreSQL 17 (alpine image)** — Relational database. **For us:** same.
- **Drizzle ORM** — TypeScript-first ORM and query builder. Schema is written as TypeScript code; migrations are generated from the schema with `drizzle-kit`. **For us:** same. The schema lives in the `@norish/db` package.

**AI and Processing**

- **OpenAI SDK** — Norish defaults to OpenAI for both LLM (recipe extraction) and Whisper (audio transcription). Also supports Ollama (per recent release notes) and any OpenAI-compatible endpoint via `AI_ENDPOINT`. **For us:** the Anthropic Claude SDK should be substituted for the LLM. Norish's `AI_PROVIDER` + `AI_ENDPOINT` + `AI_API_KEY` abstraction means we can plug in Claude with minimal code change.
- **Playwright** — Browser automation library. Norish talks to a separate `chrome-headless` container over the Chrome DevTools Protocol (CDP) WebSocket. Playwright runs _inside_ the Norish app and remotely drives the Chrome container. **For us:** same approach exactly.
- **yt-dlp** — Command-line video downloader. Supports YouTube, TikTok, Facebook, Instagram, etc. Pinned to a specific version via `YT_DLP_VERSION`, with the binary stored at `YT_DLP_BIN_DIR`. **For us:** same. It is the workhorse of the social-media import flow.
- **Sharp** — Native image processing library. Used for resizing, cropping, format conversion of uploaded photos. **For us:** same.
- **FFmpeg** — Audio/video processing. Used for extracting audio tracks before transcription. **For us:** same.

**Embedded Python parser (`apps/parser-api`)** — Norish has a Python service that handles structured recipe extraction from HTML. The Node server starts and supervises it on `127.0.0.1:8001`. **For us:** we don't need this. Our restaurants don't have a standard structured format on web pages the way recipes do (recipe schema.org markup). We can rely on the Claude API alone for metadata extraction.

---

## 3. Monorepo Structure

Norish is a **pnpm + Turborepo monorepo**. The root `package.json` declares the project private and lists workspace dependencies. The actual workspace package list comes from `pnpm-workspace.yaml` (which I could not fetch directly), but the dependencies block of the root `package.json` and the README's command examples reveal the full set of workspaces.

**Top-level layout (inferred from package references):**

```
norish/
├── apps/
│   ├── web/                  → @norish/web      (Next.js app, the main UI + API)
│   ├── mobile/               → @norish/mobile   (Expo React Native — skip for us)
│   └── parser-api/           → @norish/parser-api (Python recipe parser — skip for us)
├── packages/                 (inferred name — could also be tooling/ or similar)
│   ├── api/                  → @norish/api      (server-side tRPC routers, business logic)
│   ├── auth/                 → @norish/auth     (Better Auth setup, role/permission helpers)
│   ├── config/               → @norish/config   (runtime env-var loader, schema, defaults)
│   ├── db/                   → @norish/db      (Drizzle schema, drizzle.config.ts, migrations)
│   ├── i18n/                 → @norish/i18n     (translation keys + locales)
│   ├── queue/                → @norish/queue    (BullMQ setup, job processors)
│   ├── shared/               → @norish/shared   (cross-cutting types and utils)
│   ├── trpc/                 → @norish/trpc     (tRPC router types shared web + mobile)
│   ├── ui/                   → @norish/ui       (shared React components)
│   └── prettier-config/      → @norish/prettier-config
├── docker/
│   ├── Dockerfile
│   ├── compose.base.yaml
│   └── compose.local.yaml
├── tooling/                  (scripts: print-package-versions, check-circular-deps, etc.)
├── pnpm-workspace.yaml
├── package.json
├── turbo.json                (inferred — Turborepo config)
└── README.md
```

**Notes about each workspace:**

| Workspace                   | What lives there                                                            | Are we reusing?                                                                |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/web`                  | Next.js App Router pages, layouts, API routes, custom `server.ts`           | Yes — this is our main app.                                                    |
| `apps/mobile`               | Expo React Native mobile client                                             | **No** — PWA is enough for v1.                                                 |
| `apps/parser-api`           | Python parser for structured recipe HTML                                    | **No** — restaurants have no equivalent schema.                                |
| `packages/api`              | Server-side tRPC routers, business logic, AI integration calls              | Yes — heavily adapted.                                                         |
| `packages/auth`             | Better Auth init, provider config, role/permission helpers                  | Yes — almost as-is.                                                            |
| `packages/config`           | Runtime env-var loader (the `env-config-server.ts` mentioned in the README) | Yes — exact pattern.                                                           |
| `packages/db`               | Drizzle schema, drizzle config, migrations                                  | Yes — schema is replaced (restaurants instead of recipes), patterns preserved. |
| `packages/i18n`             | Translations                                                                | **Optional** for us — family-only app likely English-only. Defer.              |
| `packages/queue`            | BullMQ workers and job definitions                                          | Yes — used for the social media import jobs.                                   |
| `packages/shared`           | Cross-cutting types + utils                                                 | Yes.                                                                           |
| `packages/trpc`             | tRPC router type exports for client consumption                             | Yes.                                                                           |
| `packages/ui`               | Shared component library (buttons, cards, etc.)                             | Yes — slimmed down.                                                            |
| `packages/prettier-config`  | Single shared Prettier config                                               | Yes.                                                                           |
| `tooling/monorepo/scripts/` | Build scripts referenced in root package.json                               | Yes — adapt.                                                                   |
| `docker/`                   | Dockerfile and compose files                                                | Yes — see Section 4.                                                           |

**Key commands defined at the root (from `package.json`):**

- `pnpm run dev` — Turbo watches and runs all package `dev` scripts, filtered to web app and its dependencies.
- `pnpm run build` — Full production build.
- `pnpm run docker:up` / `pnpm run docker:down` — Brings up the local dependency stack (Postgres, Redis, Chrome).
- `pnpm run db:push` / `pnpm run db:generate` — Drizzle Kit commands run inside the `@norish/db` workspace.
- `pnpm run docker:build` — Builds the production Docker image, injecting a version-report JSON at build time.

**Why this matters for us:** the monorepo gives us clean separation between code that runs in many places (the schema, the tRPC contract, shared types) and code that's app-specific. Even though our app is smaller, we should adopt the same split. It costs almost nothing now and pays off when we want to share code between, e.g., the web app and a future Cloudflare Worker for backups.

---

## 4. Docker Architecture

Norish defines four runtime containers. The README ships a minimal `docker-compose.yml` that is the canonical reference. All four containers are mandatory at runtime.

### Container: `norish` (the application)

- **Image:** `norishapp/norish:latest` (pre-built and published to Docker Hub).
- **Build context:** `docker/Dockerfile` (built locally via `pnpm run docker:build`).
- **Port:** publishes `3000:3000`.
- **User:** runs as UID/GID `1000:1000` (non-root, security best practice).
- **Volume:** `norish_data:/app/uploads` — persists user-uploaded images.
- **Health check:** Node-based HTTP probe against `http://localhost:3000/api/v1/health`. Interval 1 min, timeout 15 s, retries 3, start period 1 min.
- **Depends on:** `db`, `redis`.
- **Key env vars passed in:** `AUTH_URL`, `DATABASE_URL`, `MASTER_KEY`, `CHROME_WS_ENDPOINT`, `REDIS_URL`, `UPLOADS_DIR`, plus any auth provider credentials.

### Container: `db` (PostgreSQL)

- **Image:** `postgres:17-alpine` — small, official, current.
- **Volume:** `db_data:/var/lib/postgresql/data` — persists the database.
- **Env:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- **No published port** in the minimal compose (only the app container reaches it on the internal Docker network).

### Container: `chrome-headless`

- **Image:** `zenika/alpine-chrome:latest` — slim Alpine-based Chrome.
- **Command:** runs Chrome with `--remote-debugging-address=0.0.0.0 --remote-debugging-port=3000 --headless --no-sandbox --disable-gpu --disable-dev-shm-usage`.
- **Communicates with the app via:** Chrome DevTools Protocol over WebSocket. The app connects to `ws://chrome-headless:3000` (the value of `CHROME_WS_ENDPOINT`).
- **No volumes.** Headless Chrome is stateless.
- **Used for:** scraping social media post pages where the page is JavaScript-rendered and a simple HTTP GET wouldn't work.

### Container: `redis`

- **Image:** `redis:8.4.0`.
- **Volume:** `redis_data:/data`.
- **Used for:** (1) BullMQ job queue persistence, (2) real-time event fanout between server instances / connected clients, (3) general caching.

### Inter-container communication

All four containers sit on a shared Docker Compose network (the default `default` network). They reach each other by service name (`db`, `redis`, `chrome-headless`) rather than IP. This is why the URLs are `postgres://postgres:norish@db:5432/norish` and `ws://chrome-headless:3000` — no IPs, no hard-coded hostnames.

### Adaptation notes for our restaurant app

- We use **the same four containers**, with the same images, with the same network topology. Nothing to change at the container level.
- We do **not** need a fifth container for AI or Google Places — those are external HTTP services we call from inside the `webapp` container.
- We **add** Cloudflare Tunnel + Cloudflare Access on top, but those run outside the compose stack (as a `cloudflared` service installed on the host or as a separate compose file). We do **not** embed them in the application compose.
- The `webapp` container's volume `norish_data:/app/uploads` becomes our restaurant-photo storage volume — same idea.

---

## 5. Authentication System

Norish uses **Better Auth** as the authentication library. Better Auth is a relatively new (and excellent) framework that handles sessions, OAuth, OIDC, and a database-backed configuration UI all together.

### First-user bootstrap flow

This is the pattern we want to replicate almost exactly for our app.

1. On a fresh deploy, no users exist in the database.
2. The first user to visit the app is offered a sign-up form. If no SSO provider is pre-configured via env vars, password auth (`PASSWORD_AUTH_ENABLED=auto`) is presented.
3. That first user creates an account with email + password.
4. They are automatically assigned the **server owner + server admin** role.
5. After that first sign-up completes, **user registration is automatically disabled.** From that point on, only existing users can sign in, and new users have to either (a) be added by an admin, or (b) come in through a configured OIDC/OAuth provider with claim mapping enabled.
6. The owner can then go to `Settings → Admin` and configure OIDC, GitHub, Google, AI provider keys, etc.

**The genius of this design** is that no `.env` editing is required to add or change auth providers after deploy. Everything is in the admin UI, persisted in the database, encrypted at rest using `MASTER_KEY`.

**For our app:** the requirements doc already specifies exactly this flow. The only difference is the final state: after bootstrap, our app needs to be configured to read Cloudflare Access headers and auto-create users from them, rather than (or in addition to) running its own OIDC. The Cloudflare Access integration is custom work we add on top of Norish's pattern.

### Session management

- Better Auth uses **server-side sessions** stored in PostgreSQL (the `session` table). Session IDs are issued as HttpOnly cookies.
- Sessions are short-lived but refreshable.
- `AUTH_URL` env var is critical — it sets the absolute callback URL for OAuth flows and the cookie domain.
- `TRUSTED_ORIGINS` env var is a comma-separated list of additional origins allowed to make authenticated requests (relevant for the mobile app and for any LAN-IP access).

### Roles and permissions

- Norish has a binary built-in role: **server admin** (yes/no). The first user is admin. Owners can promote others via the admin UI.
- **OIDC claim mapping** can grant admin role automatically based on a group claim (default group name `norish_admin`, configurable via `OIDC_ADMIN_GROUP`).
- Per-recipe permissions (who can view/edit/delete) are governed by **permission policies** configured in the admin UI, not in code. This is a flexible model that maps cleanly to our restaurant-tracker rules.

**For our app:** we have three roles (Owner, Admin, User), not two. We add the Owner role as a one-off marker on the very first user that is never demotable. Admin is a promotable/demotable boolean. User is the default. The per-restaurant rules ("any user can edit, only the adder can delete, admins can delete anything") map onto Norish's permission-policy pattern.

### Relevant environment variables (auth-specific)

| Variable                                                                                             | Purpose                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_URL`                                                                                           | Public URL of the instance, used for cookie domain + OAuth callbacks.                                                                                                                                            |
| `MASTER_KEY`                                                                                         | 32+ byte base64 key used to encrypt secrets stored in the DB (provider client secrets, AI API keys, etc.). Generate with `openssl rand -base64 32`. **Losing this means losing access to all encrypted config.** |
| `PASSWORD_AUTH_ENABLED`                                                                              | `auto` (default) enables password auth until the first user is created, then disables it. Can be forced to `true` or `false`.                                                                                    |
| `ENABLE_REGISTRATION`                                                                                | After bootstrap, controls whether new sign-ups are allowed. Default `false`.                                                                                                                                     |
| `TRUSTED_ORIGINS`                                                                                    | Comma-separated extra allowed origins.                                                                                                                                                                           |
| `OIDC_NAME`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_WELLKNOWN`                 | Initial OIDC provider config (so the first user can sign in via SSO before opening the admin UI).                                                                                                                |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                                                           | GitHub OAuth initial config.                                                                                                                                                                                     |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                           | Google OAuth initial config.                                                                                                                                                                                     |
| `OIDC_CLAIM_MAPPING_ENABLED`, `OIDC_GROUPS_CLAIM`, `OIDC_ADMIN_GROUP`, `OIDC_HOUSEHOLD_GROUP_PREFIX` | Claim-to-role mapping.                                                                                                                                                                                           |

---

## 6. Database Schema Patterns

Norish uses **Drizzle ORM**. I was unable to fetch the schema files directly, but the repo confirms:

- The schema lives in the `@norish/db` workspace.
- `drizzle-kit` configuration file is `./src/drizzle.config.ts` (visible in the `db:push` and `db:generate` scripts in root `package.json`).
- Migrations are applied via `pnpm run db:push` (development) or `pnpm run migrate` (same command — they're aliased).
- Schema changes are generated with `pnpm run db:generate` (creates SQL migration files).

### Patterns we should adopt (from Drizzle + standard practice)

- **Tables defined as TypeScript files** — typically one file per logical entity (e.g. `recipes.ts`, `users.ts`), exporting a const using `pgTable(...)`.
- **A single barrel file (`schema.ts`)** that re-exports every table. Drizzle Kit reads this single entry point.
- **Snake_case column names, camelCase TypeScript field names.** Drizzle handles the mapping. This is the universal convention in Drizzle projects.
- **UUIDs as primary keys** — almost certainly. Better Auth uses string IDs for users by default, and the rest of the schema typically follows suit. **(inferred)**
- **Foreign keys explicitly declared** with `references()` and `onDelete` behavior.
- **Timestamps:** `createdAt` and `updatedAt` columns with PostgreSQL `now()` defaults are standard.
- **Soft-delete columns** (`deletedAt`) are likely used in places, since the admin UI offers a cleanup retention period — `SCHEDULER_CLEANUP_MONTHS` defaults to 3.
- **Relations declared with `relations()`** — Drizzle's relational query API requires an explicit relation graph beside the table definitions.

### Tables Norish almost certainly has (matched to Better Auth + the feature set)

- `users` — id, email, name, image, role, created_at, etc.
- `accounts` — links external identities (OIDC, GitHub, Google) to a `users` row. Better Auth standard.
- `sessions` — Better Auth session table.
- `verifications` — Better Auth email verification table.
- `households` — groups of users that share recipes.
- `recipes` — the main domain entity.
- `recipe_ingredients`, `recipe_steps`, `recipe_tags` — child tables.
- `recipe_ratings` — per-user ratings.
- `groceries`, `stores`, `planned_recipes` — meal-planning entities.
- `app_config` (or similar) — single-row or key-value table that stores admin-UI settings (provider configs with secrets encrypted via `MASTER_KEY`).
- `import_jobs` — queue/status tracking for the video import pipeline.

### Adaptation for our restaurant app

Our schema will follow the same patterns. Key tables:

- `users`, `accounts`, `sessions`, `verifications` — Better Auth, unchanged.
- `restaurants` — id, name, address, state, cuisine_type, description, website, status (enum), social_url, added_by_user_id, added_at, google_rating, google_rating_fetched_at, …
- `restaurant_photos` — id, restaurant_id, file_path, uploaded_by, uploaded_at.
- `restaurant_reviews` — id, restaurant_id, user_id, stars (1–5), text, created_at, updated_at. **Unique on (restaurant_id, user_id)** to enforce "one review per user per restaurant".
- `cuisine_types` — small lookup table.
- `app_config` — admin UI settings, with secret values encrypted at rest using `MASTER_KEY`.
- `import_jobs` — social media import job tracking.
- `backups` — log of taken backups (filename, taken_at, taken_by).

The status field can be a Postgres enum or a `text` column constrained to a small set. Either is fine; the README does not reveal Norish's preference.

---

## 7. AI Integration

Norish's AI integration is built around a **provider abstraction**, not a hard-coded vendor. This is the single most important pattern for us to reuse.

### Provider abstraction

A single set of env vars controls AI behavior regardless of provider:

| Variable         | Purpose                                                                                                                                              | Default          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `AI_ENABLED`     | Global on/off switch. Default `false`.                                                                                                               | `false`          |
| `AI_PROVIDER`    | Which provider to use. Defaults to `openai`. Recent releases also support `ollama`. The codebase is structured so a new provider is a small adapter. | `openai`         |
| `AI_ENDPOINT`    | Custom base URL (e.g., for OpenAI-compatible third-party services).                                                                                  | empty            |
| `AI_MODEL`       | Default model.                                                                                                                                       | `gpt-5-mini`     |
| `AI_API_KEY`     | Provider API key. **Stored encrypted in the DB when set through the admin UI.**                                                                      | empty            |
| `AI_TEMPERATURE` | Sampling temperature.                                                                                                                                | `1.0`            |
| `AI_MAX_TOKENS`  | Cap on response length.                                                                                                                              | `10000`          |
| `AI_TIMEOUT_MS`  | Per-call timeout.                                                                                                                                    | `300000` (5 min) |

The README is explicit that **`env-config-server.ts` is the source of truth for runtime env vars**, but **most settings can be overridden through the admin UI**, with values stored in the database and encrypted via `MASTER_KEY`.

### How AI is invoked

AI is called **server-side only**, never from the browser. The flow is:

1. User triggers an AI-using action (e.g. import recipe from URL, or pasted text).
2. The Next.js server handler / tRPC procedure / BullMQ worker assembles a prompt.
3. The AI client (a thin wrapper over the OpenAI SDK that respects `AI_ENDPOINT` and `AI_API_KEY`) is called.
4. The response is parsed (often structured JSON) and persisted.
5. The user is shown the result.

This means **API keys never touch the client**. The browser only ever sees finished results.

### Adaptation for our app

- **Swap OpenAI for Anthropic Claude.** The provider abstraction is the right shape — we just add a Claude adapter beside the OpenAI one. Better still, the Anthropic API has an OpenAI-compatible mode, but the cleanest approach is to write a `@anthropic-ai/sdk` adapter and set `AI_PROVIDER=anthropic`.
- **Keep Whisper for transcription.** Whisper is best-in-class for audio-to-text and we'd be making our lives harder by switching. The `TRANSCRIPTION_PROVIDER` env var family is independent of the LLM provider.
- **Add a Google Places client.** This is new — Norish has no equivalent. We need a small server-side module that calls `https://places.googleapis.com/v1/places/{place_id}` to get the current rating, with the key restricted in Google Cloud Console to the server's IP. Store the key in `app_config`, encrypted at rest.
- **All API keys configurable via admin UI.** Never hard-coded. Never in the env file in production. Only env-bootstrappable so the first deploy can be done without the admin UI.

---

## 8. Social Media / Video Import Pipeline

This is the most complex flow in Norish and the closest match to our social-media-link import feature. The README gives us a full picture of what tools are involved; the exact step-by-step orchestration is in code I couldn't pull. What follows is the documented pipeline.

### The toolset

| Tool                                   | Role in the pipeline                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Playwright**                         | Drives the headless Chrome container over CDP to scrape the rendered HTML of the social media post (Instagram, TikTok, etc. are heavily JS-rendered).                  |
| **yt-dlp**                             | Downloads the actual video (or extracts the audio track) from the post URL. Pinned to a known-good version via `YT_DLP_VERSION`. The binary lives in `YT_DLP_BIN_DIR`. |
| **FFmpeg**                             | Extracts the audio track from the downloaded video (Whisper needs audio, not video, and the file is smaller).                                                          |
| **Whisper (`TRANSCRIPTION_PROVIDER`)** | Transcribes the audio to text. Defaults to model `whisper-1`.                                                                                                          |
| **The LLM (`AI_PROVIDER`)**            | Reads the transcription + scraped page text and extracts structured recipe data (title, ingredients, steps).                                                           |
| **BullMQ (Redis-backed queue)**        | Holds the import job while it runs, so the user's HTTP request returns immediately and the work happens in the background.                                             |

### Sequence of steps (per Norish's documented flow)

1. User pastes a URL into the "Import from video" UI.
2. Server validates the URL and enqueues a BullMQ job.
3. Worker dequeues the job. If the URL is a regular recipe webpage, it goes to the **Python parser API** first (`http://127.0.0.1:8001`), and only falls back to AI if that fails or AI is preferred for that source. **For us:** we skip this — restaurants don't have a structured-data equivalent, so we go straight to the AI path.
4. If the URL is a known video source, Playwright opens the page in headless Chrome to get any metadata + the canonical video URL.
5. yt-dlp downloads the video. There is a max-length guard (`VIDEO_MAX_LENGTH_SECONDS`, default 120s) to prevent huge downloads.
6. FFmpeg extracts the audio track.
7. The audio file is uploaded to the transcription provider (`TRANSCRIPTION_PROVIDER`).
8. The transcript (plus scraped post text) is sent to the LLM with a structured-output prompt.
9. The structured result is saved as a draft entry, the import job is marked complete, and the user is notified (real-time, via Redis pubsub → WebSocket).

### Adaptation for our restaurant app

The pipeline is the same. The only changes:

- **Prompt to the LLM is different** — we extract restaurant metadata (name, location, cuisine type, dish highlights, vibe) instead of recipe metadata.
- **We use Claude, not OpenAI** — see Section 7.
- **We probably still want the `VIDEO_MAX_LENGTH_SECONDS` cap.** Restaurant videos on TikTok are typically under 60 s anyway, so 120 s is plenty.
- **Real-time notification could be replaced with simple polling for v1.** Norish's real-time WebSocket layer is useful for live grocery-list sync; for a one-shot "your import is done" notification, polling the job status every 3 seconds is fine and simpler.

### Sensitive bit

The `chrome-headless` container is the largest attack surface in the stack — it's running a real browser, processing arbitrary URLs the user pastes in. **We never expose its port publicly.** The CDP WebSocket is reachable only from the `webapp` container on the internal Docker network. This is the default in the README's compose file (no `ports:` mapping on the `chrome-headless` service) and we must keep it that way.

---

## 9. Frontend Patterns

Norish's web frontend is **Next.js 16 with the App Router**, in the `@norish/web` (formerly the root `app/` directory) workspace.

### Routing

- **App Router (`app/` directory).** Folders are routes; `page.tsx` is the page, `layout.tsx` wraps it.
- **Server Components by default.** Components that fetch data or read cookies run on the server. Anything that needs `useState`/`useEffect` is marked `"use client"`.
- **Route Handlers** (`app/.../route.ts`) define HTTP endpoints. Norish has `/api/v1/...` for its public API and `/api/auth/...` for Better Auth callbacks.

### Data fetching

- **tRPC + TanStack Query** is the pattern. Server-side procedures are defined once, and the client calls them via a fully-typed hook. Loading/error/refetch state is managed by TanStack Query under the hood.
- **Real-time** updates flow through Redis pubsub → WebSocket → TanStack Query cache invalidation. (For our app, we likely don't need this in v1.)

### Component organization

The pre-monorepo flat structure (visible in the older repo listing) shows the conventional Next.js folders:

- `app/` — routes.
- `components/` — reusable UI components.
- `hooks/` — React hooks.
- `lib/` — utility functions, server-side helpers.
- `context/` — React Context providers.
- `server/` — server-only modules.
- `store/` and `stores/` — client state.
- `styles/` — Tailwind config + globals.
- `public/` — static assets.
- `types/` — TypeScript types.
- `i18n/` — translations.

After the monorepo refactor, these largely move into `apps/web/src/...` and into the shared `packages/` (e.g. `packages/ui/` for shared components).

### PWA configuration

- Next.js does **not** have built-in PWA support; Norish uses a custom service worker, built via the root `build:server` and `update-sw` scripts (visible in `package.json`).
- A web app manifest (`public/manifest.json`) declares the icon, name, theme color, and `display: standalone`.
- The service worker handles offline caching of the app shell and static assets.
- iOS Safari and Android Chrome both honor this manifest and offer "Add to Home Screen".

**For our app:** we adopt the same PWA approach. We don't need to build it from scratch — we copy Norish's `manifest.json` shape, swap the icons and name, and adapt its service worker.

### Styling

- Tailwind CSS v4 throughout, configured in `tailwind.config.ts`/`postcss.config.js`.
- HeroUI components provide most of the visual primitives.
- Framer Motion provides animations.
- Light/dark mode via Tailwind's `dark:` variant + a theme toggle.

---

## 10. Configuration and Environment Variables

This is the canonical list from the Norish README. Items in **bold** are the ones we should keep more or less verbatim for our restaurant app. Items in _italics_ are Norish-specific and we drop or replace them.

### Required (cannot start without these)

- **`DATABASE_URL`** — Postgres connection string.
- **`MASTER_KEY`** — 32+ byte base64 key for encrypting in-DB secrets. Generated once with `openssl rand -base64 32`. **Losing this is catastrophic — back it up.**

### Commonly set in production

- **`AUTH_URL`** — public URL of the instance. Required for OAuth callbacks and cookies.
- **`CHROME_WS_ENDPOINT`** — WebSocket URL of the headless Chrome container. Default `ws://chrome-headless:3000`.
- **`REDIS_URL`** — default `redis://redis:6379`.

### Optional runtime

- **`NODE_ENV`** — `development` or `production`.
- **`HOST`**, **`PORT`** — bind address (defaults `0.0.0.0:3000`).
- **`TRUSTED_ORIGINS`** — comma-separated extra allowed origins (e.g., a LAN IP plus the public URL).
- **`UPLOADS_DIR`** — where uploaded images live. Default `/app/uploads` in prod.
- **`ENABLE_REGISTRATION`** — allow new signups (default `false`).
- **`AI_ENABLED`** — global AI on/off (default `false`).
- **`NEXT_PUBLIC_LOG_LEVEL`** — client-side log verbosity.

### Auth setup (initial bootstrap only)

- **`PASSWORD_AUTH_ENABLED`** — `auto` is the right default.
- `OIDC_NAME`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_WELLKNOWN` — if pre-configuring OIDC.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — GitHub OAuth.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth.

**For our app:** the production auth path is Cloudflare Access, so we will rarely pre-configure OAuth env vars. The bootstrap password flow handles the very first sign-in before Cloudflare Access is wired up.

### OIDC claim mapping

- `OIDC_CLAIM_MAPPING_ENABLED`, `OIDC_SCOPES`, `OIDC_GROUPS_CLAIM`, `OIDC_ADMIN_GROUP`, `OIDC_HOUSEHOLD_GROUP_PREFIX` — for mapping OIDC group claims to roles. We probably skip household_group_prefix entirely.

### AI

- **`AI_PROVIDER`** — for us, `anthropic` (after we add the adapter).
- **`AI_ENDPOINT`**, **`AI_MODEL`**, **`AI_API_KEY`**, **`AI_TEMPERATURE`**, **`AI_MAX_TOKENS`**, **`AI_TIMEOUT_MS`**.
- _(new for us)_ `GOOGLE_PLACES_API_KEY` — for restaurant rating lookups.

### Video + transcription

- **`VIDEO_PARSING_ENABLED`**, **`VIDEO_MAX_LENGTH_SECONDS`**.
- **`YT_DLP_VERSION`**, **`YT_DLP_BIN_DIR`**.
- **`TRANSCRIPTION_PROVIDER`** (default `disabled`), **`TRANSCRIPTION_ENDPOINT`**, **`TRANSCRIPTION_API_KEY`**, **`TRANSCRIPTION_MODEL`** (default `whisper-1`).

### Parsing & content detection (Norish-specific)

- _`UNITS_JSON`, `CONTENT_INDICATORS`, `CONTENT_INGREDIENTS`_ — these are recipe-specific. Drop.
- _`LEGACY_RECIPE_PARSER_ROLLBACK`_ — recipe-specific. Drop.
- _`PARSER_API_TIMEOUT_MS`_ — recipe-specific. Drop.

### Scheduler & upload limits

- **`SCHEDULER_CLEANUP_MONTHS`** — soft-delete retention. Keep.
- **`MAX_AVATAR_FILE_SIZE`**, **`MAX_IMAGE_FILE_SIZE`** — upload size caps. Keep.
- _`MAX_VIDEO_FILE_SIZE`_ — we don't store videos, only photos. Drop.

### i18n

- _`DEFAULT_LOCALE`_, _`ENABLED_LOCALES`_ — defer for v1. English only.

### Minimum-viable env file for our app (preview)

This is what our `.env.example` will look like at the start. Concrete values come later.

```
# --- Required ---
DATABASE_URL=postgres://postgres:CHANGE_ME@db:5432/restaurants
MASTER_KEY=CHANGE_ME_GENERATE_WITH_openssl_rand_base64_32

# --- Commonly set in production ---
AUTH_URL=https://restaurants.example.com
CHROME_WS_ENDPOINT=ws://chrome-headless:3000
REDIS_URL=redis://redis:6379

# --- Optional ---
NODE_ENV=production
UPLOADS_DIR=/app/uploads
TRUSTED_ORIGINS=
ENABLE_REGISTRATION=false
AI_ENABLED=false
```

Every other knob is in the admin UI.

---

## 11. What to Reuse vs. What to Build Fresh

This is the practical bottom line of the whole exercise.

### Reuse from Norish, almost verbatim

- **Monorepo layout** — pnpm + Turborepo, `apps/` + `packages/` split.
- **Docker Compose topology** — four containers (`webapp`, `db`, `redis`, `chrome-headless`) with the same images and the same network conventions.
- **`MASTER_KEY` + admin-UI-stored encrypted secrets pattern.** This is the right answer to "no secrets in the repo".
- **First-user bootstrap → admin UI** flow for auth/configuration.
- **Better Auth** as the auth library.
- **Drizzle ORM** schema layout + `drizzle.config.ts` pattern.
- **tRPC + TanStack Query** for client-server communication.
- **BullMQ + Redis** for the social-media import job queue.
- **Playwright + yt-dlp + FFmpeg + Whisper** pipeline for video import.
- **`AI_PROVIDER` / `AI_ENDPOINT` / `AI_MODEL` / `AI_API_KEY`** provider abstraction.
- **PWA approach** — manifest + custom service worker.
- **HeroUI + Tailwind v4** as the visual system.
- **Health check at `/api/v1/health`** that returns 200 only when the app and its dependencies are healthy.
- **`SCHEDULER_CLEANUP_MONTHS`** soft-delete retention pattern.

### Reuse the _idea_, write fresh code

- **Permission policies in the admin UI** — Norish's per-recipe view/edit/delete policy maps cleanly to our owner/admin/user rules, but the actual policy expression is recipe-specific. We rewrite the policy engine to express "added_by_user_id can delete; anyone can edit; admin can delete anything".
- **Domain schema** — our `restaurants`, `restaurant_reviews`, `restaurant_photos`, `cuisine_types` tables follow Norish's Drizzle conventions but are not derived from Norish's `recipes` schema.
- **Social media import prompt** — same pipeline shape, completely different LLM prompt.
- **AI provider adapter** — same abstraction, but we add an `anthropic` adapter that uses `@anthropic-ai/sdk`.

### Build entirely from scratch (no Norish equivalent)

- **Cloudflare Access integration.** Norish doesn't have this; it expects either to handle its own auth or to sit behind a reverse proxy without identity-aware headers. We write the middleware that:
  1. Reads `Cf-Access-Authenticated-User-Email` (and the JWT in `Cf-Access-Jwt-Assertion`) from incoming requests.
  2. Verifies the JWT against Cloudflare's JWKS endpoint (cached).
  3. Looks up or auto-creates the user record.
  4. Issues a Better Auth session cookie.
- **Google Places integration.** A small server-side module that fetches the current rating and caches it per restaurant. Includes the manual-refresh endpoint and the "fetch once on add" call.
- **Restaurant-specific UI** — map view (Leaflet + OpenStreetMap tiles), status filters, US-state filter, "added by" filter. All HeroUI components, but our composition.
- **Map view component.** Norish has no map. Leaflet + OpenStreetMap tiles, no API key required.
- **Backup/restore admin features.** Norish has a "cleanup retention" scheduler but not a full database-plus-uploads backup-and-restore flow. We need:
  1. A scheduled BullMQ job that exports the DB (pg_dump) + tarballs the uploads directory + bundles app_config.
  2. An admin UI page to trigger an immediate backup and download the file.
  3. A documented restore procedure (and ideally a one-button restore in the admin UI).
- **Cuisine type management UI** — small but new.

### Drop entirely (Norish-only)

- **Households.** We have a single family group; everyone sees everything. No multi-tenancy.
- **Recurring groceries / grocery lists / stores / meal planning / CalDAV.** Not in our requirements.
- **Mobile app (Expo).** PWA only for v1.
- **Python parser API (`apps/parser-api`).** Recipes have schema.org structured data; restaurants don't.
- **Recipe-specific env vars** — `UNITS_JSON`, `CONTENT_INDICATORS`, `CONTENT_INGREDIENTS`, `LEGACY_RECIPE_PARSER_ROLLBACK`, `PARSER_API_TIMEOUT_MS`.
- **Allergy detection, nutritional info, unit conversion** — recipe-only AI features.
- **i18n** — defer to a later version.

---

## Summary

Norish is approximately 80% of the architecture for our restaurant app already done in open source under AGPL-3.0. The pieces we reuse — monorepo layout, Docker compose topology, Better Auth bootstrap flow, Drizzle schema patterns, AI provider abstraction, video import pipeline, PWA setup — solve our hardest problems for free. The pieces we add are bounded and concrete: Cloudflare Access integration, Google Places integration, Leaflet map view, restaurant domain schema, backup/restore. Everything else is reshaping Norish's recipe-centric defaults into restaurant-centric ones.
