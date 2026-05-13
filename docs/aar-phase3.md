# After Action Review — Phase 3

**Date:** 2026-05-13  
**Scope:** Auto-migration on container startup + Family Ratings & Reviews

---

## What Was Planned

Two deliverable areas:

**Part A — Auto-migration (tech debt from Phase 2).** A fresh `docker compose up` against an empty database should run all pending migrations and seed cuisine types without any host-side commands.

**Parts B–E — Family Ratings & Reviews.** Per `master-requirements.md` §3.3 and Phase 3 spec §14: each family member can submit a 1–5 star rating and/or written review per restaurant (one per user, upsert semantics). All reviews visible to all users. Family average displayed prominently. Owner and Admin can delete anyone's review; regular users can only manage their own.

---

## What Shipped

| Part | Deliverable                                                                      | Status |
| ---- | -------------------------------------------------------------------------------- | ------ |
| A    | `apps/web/scripts/migrate.ts` — startup migration + seed script                  | ✅     |
| A    | Dockerfile updated — esbuild step, migrations COPY, new CMD                      | ✅     |
| A    | `apps/web/README.md` — auto-migration documentation                              | ✅     |
| B    | `packages/shared/src/schemas/reviews.ts` — Zod schemas + types                   | ✅     |
| B    | `packages/shared/src/familyAverage.ts` — `formatFamilyAverage` utility           | ✅     |
| B    | 10 shared tests (6 schema, 4 average)                                            | ✅     |
| C    | `packages/api/src/routers/reviews.ts` — `upsert` + `delete` procedures           | ✅     |
| C    | `restaurants.ts` updated — `list` aggregate query, `get` nested reviews          | ✅     |
| D    | `RatingDisplay`, `ReviewCard`, `ReviewActions`, `ReviewModal`, `AddReviewButton` | ✅     |
| D    | Detail page and restaurant list updated                                          | ✅     |
| E    | 9 procedure tests in `reviews.test.ts`                                           | ✅     |

**Final test count:** 34 passing (15 shared, 19 API).

---

## What Went According to Plan

**Inspection findings directly shaped the implementation.** The pre-plan codebase audit caught several non-obvious constraints that would have caused rework otherwise:

- `userId` on `restaurant_reviews` is **`text`**, not `uuid` — Better Auth user IDs are strings, not UUIDs. This would have caused a type error if assumed to be uuid and not caught up front.
- `useZodForm.handleSubmit` **silently drops root-level Zod refinement errors** (issues where `path = []`). Caught during planning; `ReviewModal` was designed with a separate `formError` state from the start.
- The **relational query API can't join subqueries** — led immediately to the two-query approach for `list` (supplemental aggregate query after the main query) rather than discovering this at implementation time.
- The **cuisine seed is idempotent** — confirmed before building the startup script, so no guard logic was needed beyond the row count check that was already there.
- Relations for `restaurant_reviews` were **already declared** in Phase 1's `relations.ts` — no schema changes needed, meaning `pnpm db:generate` confirmed zero new migrations.

**The plan revisions from user review were all correct calls:**

- `pg_advisory_lock` around `migrate()` — genuinely necessary; without it, concurrent container boots (e.g. a rolling restart) could race on the `__drizzle_migrations` table.
- Rounding in the presentation layer, not the API — the API now returns raw `number | null` and `formatFamilyAverage` in shared does `.toFixed(1)`. This is the right separation: the API is a data layer, not a display layer.
- Accessible star input — `role="radiogroup"` with `aria-checked` per star and a visible "Clear rating" button. The original "click active star again to clear" pattern fails for keyboard users entirely.
- `utils.restaurants.invalidate()` (full namespace) instead of just `.get` — the list view's rating badges needed the same invalidation, which `.get`-only would have missed.

---

## Surprises and Deviations

### 1. Two Docker build/deploy failures

**Failure 1 — esbuild binary not found.**  
`node_modules/.bin/esbuild` doesn't exist at the monorepo root. pnpm only creates `.bin/` symlinks in a workspace's own `node_modules/.bin/` for that workspace's _direct_ dependencies. esbuild was only a transitive dependency of `next` (not a direct dep of anything), so its binary wasn't symlinked anywhere accessible.

Fix: added `esbuild` as a direct `devDependency` of `apps/web` and changed the Dockerfile command from `node_modules/.bin/esbuild` to `pnpm --filter @forkd/web exec esbuild`. The `exec` form uses the workspace's own PATH, which includes `apps/web/node_modules/.bin/`.

**Failure 2 — CJS bundle treated as ESM.**  
The Next.js standalone output places a `package.json` with `"type": "module"` at `/app`. Node.js respects this for every `.js` file in that directory tree, including `migrate.js`. The esbuild CJS bundle uses `require()` internally (from `pg` and `drizzle-orm`), which fails in an ESM context.

Fix: renamed the output from `migrate.js` to `migrate.cjs`. The `.cjs` extension unconditionally means CommonJS in Node.js regardless of any surrounding `package.json` type field.

Both failures were caught on the first `docker compose up --build -d` and fixed in one iteration each.

### 2. `packages/db/src/seed.ts` and `apps/web/scripts/migrate.ts` share the cuisine list

The 20-item cuisine list is duplicated. The plan called for a cross-reference comment in both files, which was done, but the underlying cause is architectural: the startup script can't import from `@forkd/db` because that workspace isn't available as an npm package in the compiled bundle context.

The right long-term fix (not done in Phase 3, not worth the complexity now) would be to extract the cuisine list to a small JSON file in `packages/db/` that both the seed script and the migration script read at build time. For now, the comments are the guard.

### 3. `ReviewModal` form-level error handling required extra care

`useZodForm`'s `handleSubmit` processes Zod issues by checking `issue.path[0]`. For root-level `.refine()` failures (e.g. "provide stars or text or both"), `path` is `[]`, so `path[0]` is `undefined` and the error is silently dropped. The form submit handler in `ReviewModal` was written to re-parse the schema before calling `handleSubmit` and pluck the root issue manually to set `formError`. This is a pattern that will recur anywhere `useZodForm` is used with a cross-field refine.

---

## Lessons Learned

| #   | Lesson                                                                                                                                                                                                                                                | Applies to                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | In pnpm workspaces, a binary is only in a workspace's `.bin/` if the package is a **direct** dependency of that workspace — not transitive. Use `pnpm --filter <pkg> exec <bin>` in Dockerfiles to find binaries through the right workspace context. | All future Dockerfile additions              |
| 2   | The Next.js standalone output sets `"type": "module"` in its root `package.json`. Any CJS-compiled script placed alongside `server.js` must use the `.cjs` extension.                                                                                 | Any future startup scripts                   |
| 3   | `useZodForm` drops root-level Zod refinement errors. Components using cross-field `.refine()` need a separate `formError` state and a manual pre-parse before submit.                                                                                 | All future forms with cross-field validation |
| 4   | Rounding belongs in `@forkd/shared`, not in the API layer. The API returns exact numeric values; presentation utilities (`formatFamilyAverage`) handle formatting.                                                                                    | All future computed display values           |

---

## Open Items Carried Into Phase 4

- **Cuisine list deduplication.** Both `seed.ts` and `migrate.ts` maintain the same 20-item array. Low risk (it's a stable list), but fragile if a new cuisine type is added. Track for Phase 4 or 5.
- **`useZodForm` root-error pattern.** Could be fixed in the hook itself (returning root errors under a `_form` key), which would eliminate the manual workaround in `ReviewModal`. Worth doing before the next form that needs a cross-field refine.
- **No UI test coverage.** The Phase 3 tests cover tRPC procedures and shared schemas. The `ReviewModal`, star input, and `ReviewActions` components have no automated tests. Acceptable for a family-only app, but noted.

---

## Verification Status

| Check                                              | Result                                                     |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`                                   | ✅ 9/9 workspaces pass                                     |
| `pnpm lint`                                        | ✅ pass                                                    |
| `pnpm test`                                        | ✅ 34/34 tests pass                                        |
| `pnpm --filter @forkd/db run db:generate`          | ✅ "No schema changes, nothing to migrate"                 |
| `docker compose up --build -d` on existing volumes | ✅ healthy, migration no-ops, seed skipped                 |
| Container startup logs show migration sequence     | ✅ advisory lock → migrate → unlock → seed → Next.js ready |
