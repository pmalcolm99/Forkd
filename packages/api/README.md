# @forkd/api

Server-side tRPC routers and business logic for Forkd. Each domain area (`restaurants`, `reviews`, `photos`, `cuisines`, `import`, `users`, `config`, `backups`) has its own router file under `src/routers/`, following the one-router-per-domain convention in §5.1 of `docs/master-requirements.md`. External API call wrappers (Claude, Google Places, Whisper) live under `src/ai/` and `src/external/`. All procedures are wrapped with `protectedProcedure`, `adminProcedure`, or `ownerProcedure` from `@forkd/auth` — RBAC is enforced here, not in the UI.
