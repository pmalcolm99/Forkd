# syntax=docker/dockerfile:1

# ── Stage 1: install dependencies ──────────────────────────────────────────
FROM node:22-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Tells pnpm it's running in a non-interactive environment — prevents TTY-gated prompts
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

WORKDIR /app

# Copy workspace manifests so Docker can cache the install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Each workspace package.json on its own COPY line (Docker COPY doesn't
# support globs that create directories automatically)
COPY apps/web/package.json ./apps/web/
COPY packages/api/package.json     ./packages/api/
COPY packages/auth/package.json    ./packages/auth/
COPY packages/config/package.json  ./packages/config/
COPY packages/db/package.json      ./packages/db/
COPY packages/queue/package.json   ./packages/queue/
COPY packages/shared/package.json  ./packages/shared/
COPY packages/trpc/package.json    ./packages/trpc/
COPY packages/ui/package.json      ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build the Next.js app ─────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy all source on top of the installed deps
COPY . .

# Git commit SHA, passed by CI as --build-arg. next.config.ts reads GIT_SHA and
# inlines it as APP_GIT_SHA so the About page can show the exact build. Defaults
# to "dev" for local builds that don't pass it.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

# Build only the web app (and the workspace packages it depends on)
RUN pnpm build --filter=@forkd/web

# Bundle the migration script into a self-contained CJS file.
# esbuild is available here as a Next.js transitive dep; --bundle inlines
# drizzle-orm and pg so the runner stage needs no extra node_modules for it.
RUN pnpm --filter @forkd/web exec esbuild scripts/migrate.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=.next/standalone/migrate.cjs

# playwright-core is dynamically imported via instrumentation.ts at runtime.
# Next.js standalone file tracing never sees it (dynamic import + webpack external),
# so it's not copied into standalone/node_modules automatically. Stage it explicitly.
RUN PW_SRC=$(find /app/node_modules/.pnpm -maxdepth 3 -type d \
      -name 'playwright-core' -path '*/node_modules/playwright-core' \
      | head -1) && \
    [ -n "$PW_SRC" ] && cp -rL "$PW_SRC" /tmp/playwright-core

# ── Stage 3: minimal production runner ─────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# node:22-alpine ships a 'node' user at UID/GID 1000:1000 — reuse it.
# Next.js standalone output mirrors the monorepo path structure:
#   apps/web/.next/standalone/apps/web/server.js
# Copying standalone/ contents here places server.js at apps/web/server.js
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./

# Static assets and public dir must be alongside the standalone server
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public        ./apps/web/public

# Drizzle migration SQL files — referenced by migrate.js at path.join(cwd, "migrations")
COPY --from=builder --chown=node:node /app/packages/db/migrations  ./migrations

# playwright-core: not auto-traced by Next.js (dynamic import + webpack external).
# Copied from builder stage where it was staged in /tmp/playwright-core.
COPY --from=builder --chown=node:node /tmp/playwright-core ./node_modules/playwright-core

ARG YT_DLP_VERSION=2025.01.15

RUN apk add --no-cache vips libheif ffmpeg python3 \
    && wget -qO /usr/local/bin/yt-dlp \
       "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
    && chmod +x /usr/local/bin/yt-dlp \
    && mkdir -p /app/uploads \
    && chown node:node /app/uploads

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# migrate.js runs pending DB migrations + seeds cuisine_types on every boot (idempotent).
# If it exits non-zero, Next.js never starts — the container fails fast with visible logs.
CMD ["sh", "-c", "node migrate.cjs && node apps/web/server.js"]
