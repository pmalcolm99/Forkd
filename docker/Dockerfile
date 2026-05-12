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

# Build only the web app (and the workspace packages it depends on)
RUN pnpm build --filter=@forkd/web

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

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
