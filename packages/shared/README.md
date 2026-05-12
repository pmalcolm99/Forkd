# @forkd/shared

Cross-cutting utilities shared across all Forkd workspaces. No side effects, no imports from other `@forkd/*` packages — this is the bottom of the dependency graph.

## Logger

`src/logger.ts` exports a Pino logger instance configured for structured JSON output.

**Redacted fields** (replaced with `[REDACTED]` in all log output):
`password`, `token`, `apiKey`, `api_key`, `secret`, `authorization`, `cookie`

In development (`NODE_ENV !== "production"`), logs are pretty-printed via `pino-pretty` with color. In production, output is newline-delimited JSON suitable for log aggregators.

**Usage:**

```ts
import { logger } from "@forkd/shared";
logger.info({ userId, action: "bootstrap" }, "Owner account created");
logger.error({ err }, "Something went wrong");
```

Never use `console.log` in production code — use the logger so structured fields are captured and secrets are redacted automatically.

**`LOG_LEVEL` env var** controls the minimum level (default: `info`). Valid values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
