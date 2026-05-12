# Forkd — Claude Code Project Context

## What this project is

Forkd is a private, family-only web app for tracking restaurants the family wants to try or has visited. Hosted on a home server, served via Cloudflare Tunnel, gated by Cloudflare Access. Modeled architecturally after [Norish](https://github.com/norish-recipes/norish).

The full product spec is in `docs/master-requirements.md`. The architectural reference (the Norish patterns we adopt) is in `docs/norish-reference.md`. **Always consult both before making decisions.**

## Who you're working with

The human operator is not a professional developer. Explain non-obvious choices. Define terms the first time they appear. When there are multiple ways to do something, pick the best one for this project and explain why — don't present a menu and ask them to choose.

## Architecture summary

- **Monorepo:** pnpm + Turborepo. Workspaces under `apps/*` and `packages/*`.
- **App:** Next.js 16 (App Router) + React 19 in `apps/web`. TypeScript throughout — no plain JS, ever.
- **Database:** PostgreSQL 17 + Drizzle ORM. Schema lives in `packages/db`.
- **Auth:** Better Auth, with custom Cloudflare Access middleware in front (Cloudflare Access verifies identity via JWT headers; Better Auth owns sessions).
- **Cache + queue:** Redis. Job queue via BullMQ for slow background work (social media imports).
- **Headless browser:** separate `chrome-headless` container driven via Playwright over CDP WebSocket.
- **AI:** Anthropic Claude SDK (LLM), OpenAI Whisper (transcription), Google Places (rating snapshots). All keys live in `app_config` table encrypted with `MASTER_KEY`, never in source.
- **UI:** HeroUI v2 + Tailwind CSS v4.
- **Client-server contracts:** tRPC. Procedures live in `packages/api/src/routers/*`. Client calls them through TanStack Query.

## Runtime topology (Docker Compose)

Four containers. None of `db`, `redis`, or `chrome-headless` have published ports — they're reachable only over the internal Docker network. The `webapp` port is bound to `127.0.0.1:3000` only; Cloudflare Tunnel (which runs outside the compose stack) reaches it from there.

- `webapp` — Next.js (frontend + backend in one container). Image tag: `forkd:latest`. Volumes: `app_uploads:/app/uploads`, `app_backups:/app/backups`.
- `db` — `postgres:17-alpine`. Volume: `db_data:/var/lib/postgresql/data`.
- `redis` — `redis:8.4.0`. Volume: `redis_data:/data`.
- `chrome-headless` — `zenika/alpine-chrome:latest`. Stateless.

## Coding conventions

- **TypeScript everywhere.** Strict mode on. No `any` unless you justify it in a comment.
- **No CommonJS.** ES modules only (`import`/`export`).
- **Validation at every trust boundary.** All tRPC inputs validated with Zod schemas. All external API responses validated before persisting.
- **Drizzle, not raw SQL.** Schema in TS files; migrations generated via `drizzle-kit`. snake_case columns, camelCase TS fields.
- **One tRPC router per domain area** (`restaurants`, `reviews`, `photos`, `cuisines`, `import`, `users`, `config`, `backups`). Each router is its own file under `packages/api/src/routers/`.
- **No code duplication across workspaces.** Anything shared lives in `packages/shared` (or a more specific package).
- **Pino for logging.** Structured JSON. Never `console.log` in production code. Secrets are redacted via Pino's redact rule.
- **HeroUI for UI primitives.** Don't hand-roll buttons, modals, inputs, tables.
- **Tailwind for styling.** Utility classes in JSX. Avoid inline `style={}` and CSS files except for global resets.

## Security rules (non-negotiable)

The repo is **public** on GitHub. Treat every file as something the whole internet can read.

- **Never commit secrets.** No API keys, no passwords, no tokens, no certificates in any committed file. `.env` is gitignored. `.env.example` contains placeholder values only.
- **`MASTER_KEY` encrypts at-rest secrets** in the `app_config` table. It is set via env var and must be backed up out-of-band by the operator.
- **RBAC server-side on every mutation.** Use `protectedProcedure` / `adminProcedure` / `ownerProcedure` wrappers in tRPC. Hiding a button in the UI is not authorization.
- **No raw SQL string interpolation.** Drizzle parameterizes; never bypass it.
- **No arbitrary URL fetching from user input.** Social-media import URLs are validated against an allowlist of hosts.
- **EXIF stripped from uploaded photos.** Always. Some EXIF includes GPS coordinates.
- **Cf-Access-\* headers are the only trusted identity source in production.** Reading them happens in middleware, before any business logic.

## File and folder rules

- **Reference docs live in `docs/`.** `docs/master-requirements.md` is the product spec. `docs/norish-reference.md` is the architectural blueprint. Both are the source of truth — when in doubt, re-read them.
- **Per-workspace `README.md`** explaining what the workspace is for and what it depends on.
- **Per-workspace `package.json`** with the package name `@forkd/<workspace-name>` (e.g., `@forkd/db`, `@forkd/api`).
- **Shared TypeScript config** in `tsconfig.base.json` at the root. Each workspace's `tsconfig.json` extends it.
- **Never create files outside the existing folder structure** without explaining why. If you think a new top-level folder is needed, propose it first.

## When you're uncertain

- If the task involves a feature in `master-requirements.md`, re-read the relevant section before designing.
- If the task involves an architectural choice, check whether `norish-reference.md` already has a pattern for it.
- If both are silent, ask the operator before proceeding. Don't invent.

## What "done" looks like

- All new code typechecks with `pnpm run typecheck`.
- All new code passes `pnpm run lint`.
- `docker compose up` brings up all four containers and they pass their healthchecks.
- Any new env vars are reflected in `.env.example` with placeholder values.
- Any new architectural pattern is documented in a per-workspace `README.md` or in `docs/`.
