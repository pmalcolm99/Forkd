# @forkd/auth

Better Auth initialization, session management, and role/permission procedure wrappers for Forkd. Exports `protectedProcedure` (any signed-in user), `adminProcedure` (admin or owner), and `ownerProcedure` (owner only) — the three tRPC middleware helpers that enforce RBAC server-side on every mutation and query. Also contains the custom Cloudflare Access middleware that verifies `Cf-Access-Jwt-Assertion` headers and auto-creates user records, per §6 of `docs/master-requirements.md`.
