# @forkd/db

Drizzle ORM schema, migrations, and database client for Forkd.

## Schema layout

One file per domain area under `src/schema/`:

| File             | Tables / enums                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `auth.ts`        | `user`, `account`, `session`, `verification` (Better Auth tables)                            |
| `cuisines.ts`    | `cuisine_types`                                                                              |
| `restaurants.ts` | `restaurants`, `restaurant_status` enum, `us_state` enum                                     |
| `reviews.ts`     | `restaurant_reviews`                                                                         |
| `photos.ts`      | `restaurant_photos`                                                                          |
| `imports.ts`     | `import_jobs`, `import_status` enum                                                          |
| `config.ts`      | `app_config`                                                                                 |
| `backups.ts`     | `backups`                                                                                    |
| `relations.ts`   | All Drizzle `relations()` declarations (imports from all other files — avoids circular deps) |
| `index.ts`       | Re-exports everything                                                                        |

## Conventions

- **Column names**: `snake_case` in the database, `camelCase` in TypeScript
- **Primary keys**: `text` for Better Auth tables (Better Auth manages IDs); `uuid` with `defaultRandom()` for all other tables
- **Foreign keys**: always explicit `onDelete` behavior (`cascade`, `set null`, etc.)
- **Timestamps**: `createdAt`, `updatedAt` on all mutable tables; `deletedAt` on soft-delete tables
- **Nullable FKs**: when a FK uses `ON DELETE SET NULL`, the column must be nullable in the schema — even if the requirements doc says "not null"

## Migration and seed scripts

```bash
# Generate SQL migration from schema changes
pnpm db:generate

# Apply pending migrations to the database
pnpm db:migrate

# Push schema directly (dev only — bypasses migration history)
pnpm db:push

# Seed cuisine_types table (idempotent — no-op if already populated)
pnpm db:seed
```

These scripts run against a live database. `DATABASE_URL` must be set (see `.env.example`).

## Configuration

`drizzle.config.ts` (at the package root, not in `src/`) tells Drizzle Kit where the schema and migrations live.
