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
