# @forkd/web

Next.js 16 App Router frontend for Forkd. Serves both the UI and the tRPC API handler.

## Dependencies

- `@forkd/api` — tRPC router
- `@forkd/auth` — Better Auth instance
- `@forkd/db` — Drizzle ORM client
- `@forkd/shared` — shared schemas, utilities
- `@forkd/trpc` — shared tRPC types

## Build tooling: Webpack for production, Turbopack for dev

Production builds use `next build --webpack`. Development uses `next dev`, which defaults to Turbopack in Next.js 16.

**Why not Turbopack for production?** HeroUI's `@react-aria/ssr` package uses a CommonJS interop pattern that Turbopack's production bundler cannot resolve, resulting in a build error. Webpack handles it correctly. This is a known upstream issue tracked at https://github.com/heroui-inc/heroui/issues. Once HeroUI ships a fix, the `--webpack` flag can be removed.

The dev experience is unaffected — Turbopack's fast refresh remains fully functional.

## Sign-in: production vs local dev

**Production (`CF_ACCESS_ENABLED=true`):** Every request passes through Cloudflare Access before reaching the app. Cloudflare verifies the user's identity and injects a signed `Cf-Access-Jwt-Assertion` header. The Next.js middleware reads this header, verifies the JWT, and redirects to `/api/auth/cloudflare-sync` if no session cookie exists. That route provisions a Better Auth session and sets the `forkd.session_token` cookie. Subsequent requests flow straight through once the cookie is present.

**Local dev (`CF_ACCESS_ENABLED=false`, the default):** No CF JWT is required. Navigate to `/dev/select-user` to pick an existing user from the database or create a new one. This page is unreachable in production (returns 404).

## Production setup

To serve Forkd publicly via Cloudflare Tunnel and Cloudflare Access:

1. **Install and configure cloudflared** — see [docs/cloudflared-setup.md](../../docs/cloudflared-setup.md)
2. **Configure Cloudflare Access** — see [docs/cloudflare-access-setup.md](../../docs/cloudflare-access-setup.md)

After setup, set `CF_ACCESS_ENABLED=true` in `.env` and restart with `docker compose up -d`.

## Database migrations on container startup

When the Docker image starts, it automatically runs `migrate.js` (compiled from `scripts/migrate.ts`) before Next.js launches. This script acquires a PostgreSQL advisory lock, applies any pending Drizzle migrations from `packages/db/migrations/`, releases the lock, then seeds the `cuisine_types` table if it is empty. The seed is idempotent — subsequent boots skip it. No separate `pnpm db:push` or migration commands are needed after `docker compose up`.
