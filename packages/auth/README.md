# @forkd/auth

Better Auth initialization and auth helpers for Forkd.

## What's in here

- **`src/auth.ts`** — Better Auth instance configured with the Drizzle adapter, email+password provider, and custom additional fields (`firstName`, `lastName`, `isAdmin`, `isOwner`).
- **`src/passwordAuthEnabled.ts`** — Per-request helper (memoized via React `cache()`) that returns whether email+password sign-in is currently available. In `auto` mode (the default), it's enabled only while no users exist (the bootstrap window), and disabled once the Owner account is created.

## AUTH_URL scheme requirement

`AUTH_URL` **must match the scheme of the environment**:

- Local dev: `http://localhost:3000` (or whatever port you use)
- Production: `https://your-domain.com`

Better Auth reads this URL to decide whether to set the `Secure` flag on session cookies. If `AUTH_URL` is `http://`, cookies are not `Secure` (required for localhost). If it's `https://`, cookies are `Secure` (required for production over Cloudflare Tunnel). Setting this wrong will cause sign-in to silently fail in production or sessions to be rejected.

## Dependencies

- `@forkd/db` — for the Drizzle adapter and user queries
- `better-auth` — session management, email+password provider
- `server-only` — prevents this package from being imported in client bundles
