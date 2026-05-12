# Forkd

A private, family-only web app for tracking restaurants the family wants to try or has already visited. Hosted on a home server, served via Cloudflare Tunnel, and gated by Cloudflare Access so only invited family members can reach it.

Full product specification: [`docs/master-requirements.md`](docs/master-requirements.md)  
Architectural reference: [`docs/norish-reference.md`](docs/norish-reference.md)

---

## Prerequisites

| Tool                                                              | Minimum version |
| ----------------------------------------------------------------- | --------------- |
| [Docker](https://docs.docker.com/get-docker/) + Docker Compose v2 | Docker 24+      |
| [Node.js](https://nodejs.org/)                                    | 22              |
| [pnpm](https://pnpm.io/installation)                              | 11              |

---

## Running locally

```bash
# 1. Install dependencies
pnpm install

# 2. Copy the example env file and fill in the required values
cp .env.example .env
#    At minimum, set POSTGRES_PASSWORD and MASTER_KEY.
#    Leave DATABASE_URL, REDIS_URL, and CHROME_WS_ENDPOINT at their defaults.

# 3. Build the image and start all four containers
docker compose up --build

# 4. Visit the app
open http://localhost:3000
```

The first time you visit you will be prompted to create the Owner account (first-user bootstrap). After that, Cloudflare Access handles identity.

---

## Development commands

```bash
pnpm run dev        # Start Next.js in watch mode (no Docker required for the app itself)
pnpm run build      # Production build across all workspaces
pnpm run typecheck  # TypeScript check across all workspaces
pnpm run lint       # ESLint across all workspaces
pnpm run test       # Vitest across all workspaces
pnpm run format     # Prettier write across all workspaces
```

---

## Repository layout

```
apps/
  web/            @forkd/web      — Next.js 16 app (UI + API)
packages/
  api/            @forkd/api      — tRPC routers and business logic
  auth/           @forkd/auth     — Better Auth setup and role helpers
  config/         @forkd/config   — Runtime env-var loader
  db/             @forkd/db       — Drizzle ORM schema and migrations
  queue/          @forkd/queue    — BullMQ job definitions and workers
  shared/         @forkd/shared   — Cross-cutting types and utilities
  trpc/           @forkd/trpc     — tRPC router type exports
  ui/             @forkd/ui       — Shared HeroUI + Tailwind component library
docker/
  Dockerfile      — Multi-stage production image build
docker-compose.yml
```

---

## Security note

The Google Places API key must be restricted to the server's IP in the Google Cloud Console — see §7.3 of `docs/master-requirements.md`. Enable billing alerts in Google Cloud regardless of the free-credit tier.

`MASTER_KEY` encrypts all secrets stored in the database. Back it up separately from the database. Without it, all encrypted `app_config` values (API keys, etc.) are unreadable.
