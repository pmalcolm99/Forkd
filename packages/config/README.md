# @forkd/config

Runtime environment-variable loader and Zod validation schema for Forkd. Exports a single validated `env` object that every other workspace imports instead of reading `process.env` directly. Modeled after the `env-config-server.ts` pattern described in §10 of `docs/norish-reference.md`. All variables listed in §10 of `docs/master-requirements.md` are declared here; missing or malformed values cause a startup error with a clear message rather than a silent runtime failure.
