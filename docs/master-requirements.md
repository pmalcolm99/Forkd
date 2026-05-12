# Forkd — Master Requirements

> **Purpose.** This document is the single source of truth for the Forkd project. It is the spec a developer (or Claude Code) follows to build the application. It pairs with `norish-reference.md`, which is the architectural blueprint we inherit from; this document tells you _what_ to build, the Norish reference tells you _how_ to shape it.
>
> **Read both.** Every section below cross-references the Norish reference wherever an analogous pattern already exists. If Norish has already solved a problem, we adapt their solution rather than invent a new one.

---

## 1. Project Summary

Forkd is a **private, family-only web application** for keeping track of restaurants the family wants to try and restaurants they have already visited. It is not public-facing. Access is restricted to invited family members through Cloudflare Access (single sign-on), and the app itself is served through a Cloudflare Tunnel from a home server.

For each restaurant, Forkd stores the kind of information a family would naturally want to compare notes on: name, location (US state), cuisine, status (want to try / been there and liked it / been there and didn't / closed), the family's own star ratings and written reviews, an optional public Google rating snapshot, photos, and — for restaurants discovered through social media — a link back to the original TikTok, YouTube, or Facebook post.

Forkd is built as a **full-stack TypeScript application** using Next.js, PostgreSQL, Redis, and a headless Chrome container, all orchestrated by a single `docker-compose.yml` file. It is structurally modeled after the open-source [Norish](https://github.com/norish-recipes/norish) recipe app, which has already solved most of the hard architectural problems (self-hosted Docker stack, first-user bootstrap, role-based permissions, AI-assisted import pipeline, PWA installability). Forkd reuses Norish's patterns wherever they apply and adds what's specific to restaurants: the Cloudflare Access integration, Google Places integration, a Leaflet map view, and a backup/restore flow.

Forkd is installable as a **Progressive Web App (PWA)** on iOS and Android, so family members can use it like a native app on their phones.

---

## 2. User Roles and Permissions

Forkd has three roles. There is exactly one Owner (the very first user to complete bootstrap), zero or more Admins (promoted by the Owner), and zero or more Users (everyone else).

### Permissions matrix

| Action                                                    | Owner | Admin | User |
| --------------------------------------------------------- | :---: | :---: | :--: |
| Sign in via Cloudflare Access                             |  ✅   |  ✅   |  ✅  |
| View all restaurants                                      |  ✅   |  ✅   |  ✅  |
| Add a restaurant                                          |  ✅   |  ✅   |  ✅  |
| Edit any restaurant (regardless of who added it)          |  ✅   |  ✅   |  ✅  |
| Delete a restaurant they added themselves                 |  ✅   |  ✅   |  ✅  |
| Delete a restaurant added by someone else                 |  ✅   |  ✅   |  ❌  |
| Upload photos to any restaurant                           |  ✅   |  ✅   |  ✅  |
| Delete their own uploaded photos                          |  ✅   |  ✅   |  ✅  |
| Delete anyone's uploaded photos                           |  ✅   |  ✅   |  ❌  |
| Submit / edit / delete their own rating + review          |  ✅   |  ✅   |  ✅  |
| View other family members' ratings + reviews              |  ✅   |  ✅   |  ✅  |
| Edit or delete another user's rating + review             |  ✅   |  ✅   |  ❌  |
| Trigger a Google rating refresh on any restaurant         |  ✅   |  ✅   |  ✅  |
| Import a restaurant from a TikTok/YouTube/Facebook URL    |  ✅   |  ✅   |  ✅  |
| Filter restaurants by status / state / cuisine / added-by |  ✅   |  ✅   |  ✅  |
| View the map view                                         |  ✅   |  ✅   |  ✅  |
| Update their own profile (first/last name)                |  ✅   |  ✅   |  ✅  |
| View the list of all registered users                     |  ✅   |  ✅   |  ❌  |
| Promote a user to Admin                                   |  ✅   |  ❌   |  ❌  |
| Revoke a user's Admin role                                |  ✅   |  ❌   |  ❌  |
| Remove a user from the system                             |  ✅   |  ❌   |  ❌  |
| View admin settings UI                                    |  ✅   |  ✅   |  ❌  |
| Configure AI provider keys (Claude, Whisper)              |  ✅   |  ✅   |  ❌  |
| Configure Google Places API key                           |  ✅   |  ✅   |  ❌  |
| Configure backup schedule                                 |  ✅   |  ❌   |  ❌  |
| Trigger a manual backup                                   |  ✅   |  ❌   |  ❌  |
| Download a backup file                                    |  ✅   |  ❌   |  ❌  |
| Restore from a backup file                                |  ✅   |  ❌   |  ❌  |
| Restart the server (to apply settings changes)            |  ✅   |  ❌   |  ❌  |
| Manage the cuisine type list                              |  ✅   |  ✅   |  ❌  |

### Notes on the role model

- **Owner is one-of-a-kind and non-transferable.** Only the very first user to complete bootstrap becomes Owner. The Owner cannot be demoted or removed by the system. (If the human Owner ever needs to hand over ownership, that happens out-of-band by editing the database directly, which is an intentional speed bump.)
- **Admin is a flag, not a separate identity.** A user is "Admin" or not. Admins inherit all User permissions plus configuration access.
- **User is the default role** for everyone who signs in via Cloudflare Access and isn't promoted.
- This three-role model diverges from Norish's two-role model (admin yes/no). We get there by adding a single `is_owner` boolean column on top of Norish's existing admin flag — see Section 4.

---

## 3. Feature Specifications

Every feature below cites the Norish pattern it adapts (if any). When a feature has no Norish equivalent, that is called out.

### 3.1 Restaurant Catalog

**What it does.** A central list of every restaurant any family member has added. The catalog supports browsing, filtering, searching, and full CRUD (create, read, update, delete) on each entry.

**Behavior.**

- All restaurants are visible to all signed-in users. There is no per-restaurant visibility.
- Filters: by status, by US state, by cuisine type, by added-by user. Multiple filters combine with AND logic.
- A simple text search across name and address.
- Default sort: most recently added first. Other sort options: alphabetical, by family average rating, by Google rating.

**Norish mapping.** Direct analog to Norish's recipe catalog (Section 9 of `norish-reference.md`). Same Next.js App Router page structure (`app/restaurants/page.tsx`, `app/restaurants/[id]/page.tsx`, `app/restaurants/new/page.tsx`), same TanStack Query + tRPC data flow.

**Constraints.** Server-side authorization on every read and write — even though all signed-in users can view all restaurants, "signed-in" must be verified server-side via Better Auth session, never trusted from the client.

### 3.2 Restaurant Status

**What it does.** Each restaurant has exactly one status from a fixed list.

**Allowed values.**

- `want_to_try`
- `been_loved`
- `been_okay`
- `been_disliked`
- `permanently_closed`

**Behavior.**

- Status is set when the restaurant is added (default `want_to_try`).
- Any user can change the status at any time.
- Status changes are not versioned in v1 (no history table). If we want history later, we add a `restaurant_status_history` table.

**Norish mapping.** No direct analog; Norish recipes don't have a status field. We model this as a PostgreSQL enum (`pg_enum`) — Drizzle supports this directly via `pgEnum`.

**Constraints.** Status values are an enum at the database level so invalid values cannot be written.

### 3.3 Family Ratings and Reviews

**What it does.** Each family member can give each restaurant a 1–5 star rating and an optional written review.

**Behavior.**

- Each user can have at most one rating + review per restaurant. Submitting again updates the existing entry (an upsert).
- Reviews and ratings are independent: a user can submit a rating without a review, or a review without a rating.
- All family members' ratings and reviews are visible to all family members.
- The restaurant detail page shows the family average rating prominently, computed as the mean of all user ratings for that restaurant.
- A user can delete their own rating + review at any time.
- Only Owner and Admin can edit or delete another user's rating + review.

**Norish mapping.** Maps to Norish's `recipe_ratings` table pattern. We use the same `(restaurant_id, user_id)` unique constraint to enforce "one rating per user per restaurant".

**Constraints.** Stars must be an integer between 1 and 5 inclusive. Written review text is limited to 5,000 characters (enough for a thoughtful review, not so long it can be abused). Input is HTML-escaped on render to prevent XSS.

### 3.4 Google Rating Snapshot

**What it does.** When a restaurant is added (or on demand), Forkd fetches the current Google rating for that restaurant from the Google Places API and stores the numeric score.

**Behavior.**

- The snapshot is **just the numeric rating** (e.g., `4.3`) plus the timestamp it was fetched. No written Google reviews are imported, ever, for both copyright and clutter reasons.
- The Google Place ID is stored on the restaurant so future refreshes can target the same place unambiguously.
- The snapshot is not kept in sync automatically. Any user can manually refresh it from the restaurant detail page by clicking a "Refresh Google rating" button.
- If the Google Places API key is not configured, the field remains empty and the refresh button is disabled with a tooltip explaining why.
- If a refresh fails (network error, key revoked, rate limited), the existing snapshot is preserved and the user sees an inline error.

**Norish mapping.** No direct analog. This is one of the "build entirely from scratch" pieces (Section 11 of `norish-reference.md`).

**Constraints.** The Google Places API is paid; Google grants $200/month in free credits, sufficient for a family-scale app. The API key must be restricted to the server's IP in the Google Cloud Console — we will document this in the README. The key is stored encrypted in the database (`app_config` table) using the Norish `MASTER_KEY` pattern.

### 3.5 Restaurant Metadata Fields

Each restaurant entry has:

| Field                    | Type                | Required | Notes                                                     |
| ------------------------ | ------------------- | :------: | --------------------------------------------------------- |
| Name                     | text                |    ✅    | Up to 200 chars                                           |
| Address                  | text                |    ✅    | Free text; up to 500 chars                                |
| US state                 | enum / text         |    ✅    | One of the 50 states + DC (51 values)                     |
| Cuisine type             | foreign key         |    ❌    | Optional; references `cuisine_types`                      |
| Description              | text                |    ❌    | Up to 2000 chars                                          |
| Website URL              | text                |    ❌    | Validated as a URL                                        |
| Status                   | enum                |    ✅    | Defaults to `want_to_try`                                 |
| Latitude / Longitude     | numeric             |    ❌    | For map view; populated from Google Places when available |
| Google Place ID          | text                |    ❌    | For refresh lookups                                       |
| Google rating            | numeric (1 decimal) |    ❌    | Last fetched snapshot                                     |
| Google rating fetched at | timestamp           |    ❌    | When the snapshot was taken                               |
| Social media URL         | text                |    ❌    | The original TikTok/YouTube/Facebook URL if imported      |
| Added by user            | foreign key         |    ✅    | References `users.id`                                     |
| Added at                 | timestamp           |    ✅    | Defaults to `now()`                                       |
| Updated at               | timestamp           |    ✅    | Auto-updated on every edit                                |

**Norish mapping.** Same shape as Norish's `recipes` table — see Section 6 of `norish-reference.md`.

### 3.6 Map View

**What it does.** A full-screen interactive map showing every restaurant in the catalog as a pin. Clicking a pin opens a popup with the restaurant name, status, and a link to its detail page. The same filters as the list view (status, state, cuisine, added-by) apply.

**Behavior.**

- Map provider is **Leaflet** with **OpenStreetMap** tiles. No API key required — this is the deciding factor versus Mapbox or Google Maps.
- Restaurants without latitude/longitude are not shown on the map but are still listed in the catalog. The detail page shows a note encouraging the user to refresh metadata to get coordinates.
- The map auto-fits to show all visible (filtered) pins. The user can manually pan and zoom.
- Marker icons are color-coded by status (e.g., green for "loved it", yellow for "okay", red for "didn't like", gray for "want to try", black for "closed").

**Norish mapping.** No direct analog — Norish has no map. This is built fresh. Norish's filter UI patterns (HeroUI components, filter state managed via URL query params for deep-linkability) are adopted as-is.

**Constraints.** Leaflet runs entirely client-side; OpenStreetMap tiles are served from `tile.openstreetmap.org` (a free, community-funded service). We will respect the OpenStreetMap tile usage policy: include attribution in the map UI, cache tiles where reasonable, and not bulk-download.

### 3.7 Manual Add (with AI assist)

**What it does.** A user types a restaurant name and location (e.g., "Casa Bonita, Lakewood, CO"), Forkd searches Google Places, the user picks the matching result, and a draft restaurant entry is created with as many fields pre-populated as possible.

**Behavior.**

1. User clicks "Add restaurant" → search modal opens.
2. User types a query. Forkd calls Google Places **Text Search** (`places.googleapis.com/v1/places:searchText`) and shows up to 5 results with name, address, and a small thumbnail.
3. User picks a result, or clicks "None of these — add manually" to skip Google Places.
4. If Google Places was used: Forkd populates name, address, state (derived from address), latitude, longitude, website, Google rating, and Google Place ID automatically.
5. If Claude API is configured: Forkd calls Claude with the Google Places result and a structured-output prompt to extract `cuisine_type` and a `description`. These can be edited before save.
6. The user reviews the draft and clicks "Save". The restaurant is created with status `want_to_try` by default.

**Norish mapping.** Same shape as Norish's "add recipe" flow, but the data source is Google Places (text search) instead of a recipe URL parser. The AI assist step is the same provider-abstracted call described in Section 7 of `norish-reference.md`.

**Constraints.**

- The Google Places text search must be triggered server-side (the API key never reaches the browser).
- If Google Places is not configured, the search step is skipped and the user is shown a blank form to fill in manually.
- All AI-populated fields are presented as editable defaults — the user is never forced to accept what Claude suggested.

**Assumption made:** The original requirements say "Users can manually search for a restaurant by name/location and add it to the catalog." This is interpreted as a Google Places text search. Confirm this matches your intent.

### 3.8 Social Media Import (TikTok, YouTube, Facebook)

**What it does.** A user pastes a URL from TikTok, YouTube, or Facebook into an "Import from social media" form. Forkd fetches the post, extracts any video, transcribes the audio, runs the transcript through Claude to extract restaurant metadata, and creates a draft restaurant entry for the user to review and save.

**Behavior.** See Section 8 of this document for the full step-by-step pipeline.

**Norish mapping.** Adopts Norish's video import pipeline (Section 8 of `norish-reference.md`) almost verbatim. The only changes are: (a) Claude instead of OpenAI for the LLM step, (b) restaurant-extraction prompt instead of recipe-extraction prompt, (c) we skip the Norish Python parser API since restaurants have no schema.org equivalent.

**Constraints.**

- Video downloads are capped at `VIDEO_MAX_LENGTH_SECONDS` (default 120 seconds) to prevent huge downloads.
- The `chrome-headless` container is reachable only on the internal Docker network — never expose its port publicly.
- If any AI key is missing (Whisper or Claude), the import fails gracefully with a clear error explaining which key is missing.

### 3.9 Photo Uploads

**What it does.** Users can upload photos to any restaurant. Photos are stored on the server in a Docker volume.

**Behavior.**

- Multiple photos per restaurant, up to a soft cap of **10 photos per restaurant** to keep the UI sane (configurable in `app_config`).
- Supported formats: JPEG, PNG, WebP, HEIC (HEIC converted on upload).
- Maximum file size per upload: 10 MB (configurable via `MAX_IMAGE_FILE_SIZE`, default matching Norish's pattern).
- Images are processed with **Sharp** on upload: resized to a max 2000px on the long edge, EXIF stripped (privacy + smaller files), saved as WebP.
- A 400px thumbnail is generated for list/grid views.
- Files are stored under `UPLOADS_DIR` (default `/app/uploads`), organized as `restaurants/{restaurant_id}/{photo_id}.webp` and `restaurants/{restaurant_id}/{photo_id}_thumb.webp`.
- The database stores file paths, not the binary data.
- Photos uploaded by a user can be deleted by that user, by any Admin, or by the Owner. They cannot be deleted by other Users.

**Norish mapping.** Same volume mount (`norish_data:/app/uploads`), same Sharp-based processing pipeline, same path-in-DB / file-on-disk pattern as Norish.

**Constraints.** EXIF stripping is mandatory (some EXIF data includes precise GPS coordinates the user may not realize they're sharing). Uploaded filenames are never trusted — we always generate our own UUID-based filenames server-side.

**Assumption made:** A soft cap of 10 photos per restaurant. Confirm or adjust.

### 3.10 Filtering and Browsing

**What it does.** Filters that narrow the list of visible restaurants on both the list view and the map view.

**Available filters.**

- **Status:** multi-select; defaults to all five values selected.
- **US state:** single-select dropdown of 51 values (50 states + DC) plus "All".
- **Cuisine type:** multi-select dropdown of all cuisine types currently in use.
- **Added by:** single-select dropdown of all family members plus "All".
- **Free text:** searches name and address (case-insensitive partial match).

**Behavior.** Filter state is encoded in the URL query string (`?status=want_to_try,been_loved&state=CO&added_by=jane`) so a filtered view is shareable and survives page refresh.

**Norish mapping.** Same approach Norish uses for recipe filtering — URL-encoded filter state + TanStack Query keyed by the filter state.

### 3.11 User Management (Admin)

**What it does.** The Owner can view all registered users, promote a user to Admin, or revoke Admin from a user.

**Behavior.**

- Accessed via `Admin Settings → Users`.
- A table lists every user with: avatar/initials, full name, email, role (Owner / Admin / User), date joined, last sign-in.
- Per-row actions: "Promote to Admin" (visible if user is not currently Admin), "Revoke Admin" (visible if user is currently Admin), "Remove user" (with confirmation modal). The Owner row has no actions.
- Removing a user does not delete the restaurants or reviews they added — those remain in the catalog with the original `added_by_user_id`, marked "added by (former member)" in the UI.

**Norish mapping.** Adopts Norish's admin UI pattern (HeroUI table component, tRPC mutations for promote/demote). Norish has only one role boolean; we add the Owner check on top.

**Constraints.** All actions in this section are gated by `user.is_owner === true` server-side, not just hidden in the UI.

---

## 4. Data Model

All tables follow the Drizzle ORM conventions documented in Section 6 of `norish-reference.md`: TypeScript schema files in the `@forkd/db` workspace, snake_case columns, camelCase TS fields, UUID primary keys, explicit foreign keys with `onDelete` behavior, `createdAt`/`updatedAt` timestamps with `now()` defaults.

### 4.1 Better Auth tables (unchanged from Norish)

- **`users`** — `id` (uuid pk), `email` (text unique), `email_verified` (bool), `name` (text), `first_name` (text), `last_name` (text), `image` (text nullable), `is_admin` (bool, default false), `is_owner` (bool, default false), `created_at` (timestamp), `updated_at` (timestamp).
  - **Constraint:** at most one row may have `is_owner = true`. Enforced via a partial unique index: `CREATE UNIQUE INDEX one_owner ON users (is_owner) WHERE is_owner = true`.
- **`accounts`** — Better Auth standard table; links external identities (Cloudflare Access JWT subject, OIDC providers, etc.) to a `users` row.
- **`sessions`** — Better Auth standard table; session cookies are HttpOnly, Secure, SameSite=Lax.
- **`verifications`** — Better Auth standard table; used only during the password-bootstrap flow.

### 4.2 Domain tables

#### `cuisine_types`

| Column       | Type                    | Notes                                      |
| ------------ | ----------------------- | ------------------------------------------ |
| `id`         | uuid pk                 |                                            |
| `name`       | text not null unique    | e.g., "Mexican", "Italian", "Burger Joint" |
| `created_at` | timestamp default now() |                                            |

Seeded on first run with a starter list (~20 common cuisines); Admins can add/rename/remove.

#### `restaurants`

| Column                     | Type                                                    | Notes                                                                        |
| -------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `id`                       | uuid pk                                                 |                                                                              |
| `name`                     | text not null                                           | max 200 chars (validated app-side)                                           |
| `address`                  | text not null                                           | max 500 chars                                                                |
| `state`                    | `us_state_enum` not null                                | 51 values                                                                    |
| `cuisine_type_id`          | uuid nullable                                           | FK → `cuisine_types.id`, on delete set null                                  |
| `description`              | text nullable                                           | max 2000 chars                                                               |
| `website`                  | text nullable                                           | URL-validated                                                                |
| `status`                   | `restaurant_status_enum` not null default `want_to_try` | see below                                                                    |
| `latitude`                 | numeric(9,6) nullable                                   |                                                                              |
| `longitude`                | numeric(9,6) nullable                                   |                                                                              |
| `google_place_id`          | text nullable unique                                    | for re-fetching                                                              |
| `google_rating`            | numeric(2,1) nullable                                   | e.g., 4.3                                                                    |
| `google_rating_fetched_at` | timestamp nullable                                      | snapshot timestamp                                                           |
| `social_url`               | text nullable                                           | original TikTok/YouTube/Facebook URL                                         |
| `added_by_user_id`         | uuid not null                                           | FK → `users.id`, on delete set null (preserve restaurants when user removed) |
| `created_at`               | timestamp default now()                                 |                                                                              |
| `updated_at`               | timestamp default now()                                 | bumped on every update                                                       |
| `deleted_at`               | timestamp nullable                                      | soft-delete (Norish pattern)                                                 |

**Indexes:** `(state)`, `(cuisine_type_id)`, `(added_by_user_id)`, `(status)` — these are the four filter fields.

#### `restaurant_status_enum` (PostgreSQL enum)

`want_to_try` | `been_loved` | `been_okay` | `been_disliked` | `permanently_closed`

#### `us_state_enum` (PostgreSQL enum)

`AL` | `AK` | `AZ` | ... | `WY` | `DC` (51 values total).

#### `restaurant_reviews` (family reviews)

| Column          | Type                    | Notes                                    |
| --------------- | ----------------------- | ---------------------------------------- |
| `id`            | uuid pk                 |                                          |
| `restaurant_id` | uuid not null           | FK → `restaurants.id`, on delete cascade |
| `user_id`       | uuid not null           | FK → `users.id`, on delete cascade       |
| `stars`         | smallint nullable       | 1–5 (CHECK constraint)                   |
| `text`          | text nullable           | max 5000 chars                           |
| `created_at`    | timestamp default now() |                                          |
| `updated_at`    | timestamp default now() |                                          |

**Unique constraint:** `(restaurant_id, user_id)` — one review per user per restaurant.

#### `restaurant_photos`

| Column                | Type                    | Notes                                    |
| --------------------- | ----------------------- | ---------------------------------------- |
| `id`                  | uuid pk                 |                                          |
| `restaurant_id`       | uuid not null           | FK → `restaurants.id`, on delete cascade |
| `uploaded_by_user_id` | uuid not null           | FK → `users.id`, on delete set null      |
| `file_path`           | text not null           | relative to `UPLOADS_DIR`                |
| `thumb_path`          | text not null           | thumbnail path                           |
| `width`               | int nullable            | post-processing dimensions               |
| `height`              | int nullable            |                                          |
| `byte_size`           | int not null            |                                          |
| `created_at`          | timestamp default now() |                                          |

#### `import_jobs` (social media import tracking)

| Column          | Type                                           | Notes                                             |
| --------------- | ---------------------------------------------- | ------------------------------------------------- |
| `id`            | uuid pk                                        |                                                   |
| `user_id`       | uuid not null                                  | FK → `users.id`, on delete cascade                |
| `source_url`    | text not null                                  | the pasted TikTok/YouTube/Facebook URL            |
| `status`        | `import_status_enum` not null default `queued` | see below                                         |
| `step`          | text nullable                                  | human-readable current step, e.g., "transcribing" |
| `error_message` | text nullable                                  | populated if `status = failed`                    |
| `restaurant_id` | uuid nullable                                  | FK → `restaurants.id`, set when draft is created  |
| `created_at`    | timestamp default now()                        |                                                   |
| `updated_at`    | timestamp default now()                        |                                                   |
| `completed_at`  | timestamp nullable                             |                                                   |

`import_status_enum`: `queued` | `downloading` | `transcribing` | `extracting` | `completed` | `failed`.

#### `app_config` (admin UI settings)

Key-value pattern as in Norish. Secret values are encrypted at rest using `MASTER_KEY` (AES-256-GCM via Better Auth's encryption utilities).

| Column               | Type                    | Notes                                                                      |
| -------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `key`                | text pk                 | e.g., `ai.claude.api_key`, `google_places.api_key`, `backup.schedule_cron` |
| `value`              | text                    | plaintext for non-secrets, encrypted ciphertext for secrets                |
| `is_secret`          | bool not null           | controls whether `value` is encrypted                                      |
| `updated_by_user_id` | uuid nullable           | FK → `users.id`                                                            |
| `updated_at`         | timestamp default now() |                                                                            |

#### `backups` (audit log of taken backups)

| Column                 | Type                    | Notes                                            |
| ---------------------- | ----------------------- | ------------------------------------------------ |
| `id`                   | uuid pk                 |                                                  |
| `filename`             | text not null           | e.g., `forkd-backup-2026-05-10T12-00-00Z.tar.gz` |
| `byte_size`            | bigint not null         |                                                  |
| `trigger`              | text not null           | `manual` or `scheduled`                          |
| `triggered_by_user_id` | uuid nullable           | FK → `users.id`, null for scheduled              |
| `created_at`           | timestamp default now() |                                                  |
| `deleted_at`           | timestamp nullable      | when the file was pruned                         |

### 4.3 Relations summary (Drizzle `relations()`)

- `users` has many `restaurants` (as `added_by_user_id`), many `restaurant_reviews`, many `restaurant_photos` (as `uploaded_by_user_id`).
- `restaurants` belongs to one `cuisine_type` (optional), belongs to one `users` (`added_by_user_id`), has many `restaurant_reviews`, has many `restaurant_photos`.
- `restaurant_reviews` belongs to one `restaurants` and one `users`.
- `restaurant_photos` belongs to one `restaurants` and one `users`.

---

## 5. API Surface

Following Norish, the primary client-server communication is **tRPC** (Section 2 of `norish-reference.md`). REST endpoints exist only where required by external protocols (health checks, Better Auth callbacks, multipart uploads, file downloads).

### 5.1 tRPC procedures

All procedures are organized into routers under `packages/api/src/routers/`.

#### `auth` router

| Procedure                | Type     | Who                              | What it does                                        |
| ------------------------ | -------- | -------------------------------- | --------------------------------------------------- |
| `auth.me`                | query    | any signed-in                    | returns current user (id, email, names, role flags) |
| `auth.updateProfile`     | mutation | any signed-in                    | updates first/last name on own user                 |
| `auth.completeBootstrap` | mutation | unauthenticated, first call only | creates the Owner account with email + password     |

#### `restaurants` router

| Procedure                         | Type     | Who                 | What it does                                                     |
| --------------------------------- | -------- | ------------------- | ---------------------------------------------------------------- |
| `restaurants.list`                | query    | any signed-in       | returns filtered list (status, state, cuisine, added_by, search) |
| `restaurants.get`                 | query    | any signed-in       | returns single restaurant + photos + reviews                     |
| `restaurants.create`              | mutation | any signed-in       | creates a restaurant draft (post-Google-Places-search)           |
| `restaurants.update`              | mutation | any signed-in       | updates any field on any restaurant                              |
| `restaurants.delete`              | mutation | adder, Admin, Owner | soft-deletes a restaurant                                        |
| `restaurants.refreshGoogleRating` | mutation | any signed-in       | re-fetches rating from Google Places                             |
| `restaurants.searchGooglePlaces`  | query    | any signed-in       | server-side proxy to Google Places text search                   |

#### `reviews` router

| Procedure        | Type     | Who                         | What it does                               |
| ---------------- | -------- | --------------------------- | ------------------------------------------ |
| `reviews.upsert` | mutation | any signed-in               | creates or updates the caller's own review |
| `reviews.delete` | mutation | review author, Admin, Owner | deletes a review                           |

#### `photos` router

| Procedure       | Type     | Who                    | What it does                  |
| --------------- | -------- | ---------------------- | ----------------------------- |
| `photos.list`   | query    | any signed-in          | lists photos for a restaurant |
| `photos.delete` | mutation | uploader, Admin, Owner | deletes a photo               |

(Photo upload itself is a REST endpoint — see 5.2.)

#### `cuisines` router

| Procedure         | Type     | Who           | What it does                                           |
| ----------------- | -------- | ------------- | ------------------------------------------------------ |
| `cuisines.list`   | query    | any signed-in | lists all cuisine types                                |
| `cuisines.create` | mutation | Admin, Owner  | adds a cuisine type                                    |
| `cuisines.rename` | mutation | Admin, Owner  | renames a cuisine type                                 |
| `cuisines.delete` | mutation | Admin, Owner  | deletes a cuisine type (restaurants using it get null) |

#### `import` router

| Procedure       | Type     | Who           | What it does                                           |
| --------------- | -------- | ------------- | ------------------------------------------------------ |
| `import.start`  | mutation | any signed-in | queues a BullMQ job for a social URL                   |
| `import.status` | query    | any signed-in | polls a job's status (used until WebSockets are added) |

#### `users` router

| Procedure              | Type     | Who          | What it does                                            |
| ---------------------- | -------- | ------------ | ------------------------------------------------------- |
| `users.list`           | query    | Admin, Owner | lists all users                                         |
| `users.promoteToAdmin` | mutation | Owner        | sets `is_admin = true`                                  |
| `users.revokeAdmin`    | mutation | Owner        | sets `is_admin = false`                                 |
| `users.remove`         | mutation | Owner        | deletes a user (cascades preserve content via SET NULL) |

#### `config` router (admin settings)

| Procedure                 | Type     | Who          | What it does                                           |
| ------------------------- | -------- | ------------ | ------------------------------------------------------ |
| `config.get`              | query    | Admin, Owner | returns app_config values (secrets masked as `***`)    |
| `config.set`              | mutation | Admin, Owner | sets a config value; encrypts if `is_secret`           |
| `config.testClaude`       | mutation | Admin, Owner | sends a test prompt to verify the key                  |
| `config.testWhisper`      | mutation | Admin, Owner | sends a test audio to verify the key                   |
| `config.testGooglePlaces` | mutation | Admin, Owner | runs a test text search to verify the key              |
| `config.restartServer`    | mutation | Owner        | signals the supervisor to restart the webapp container |

#### `backups` router

| Procedure             | Type     | Who   | What it does                              |
| --------------------- | -------- | ----- | ----------------------------------------- |
| `backups.list`        | query    | Owner | lists existing backup files               |
| `backups.createNow`   | mutation | Owner | enqueues an immediate backup job          |
| `backups.setSchedule` | mutation | Owner | updates the cron schedule in `app_config` |
| `backups.delete`      | mutation | Owner | deletes a backup file                     |

(Backup download and restore are REST endpoints — see 5.2.)

### 5.2 REST endpoints

These cannot be tRPC because they involve file streams or external callers.

| Method | Path                                 | Who           | What it does                                                            |
| ------ | ------------------------------------ | ------------- | ----------------------------------------------------------------------- |
| `GET`  | `/api/v1/health`                     | public        | health check; returns 200 only when DB, Redis, and Chrome are reachable |
| `POST` | `/api/auth/[...all]`                 | public        | Better Auth handler (sign-in, sign-out, callbacks)                      |
| `POST` | `/api/v1/photos/upload`              | any signed-in | multipart upload; body contains `restaurant_id` + file                  |
| `GET`  | `/api/v1/photos/:path`               | any signed-in | serves a photo file with auth check                                     |
| `GET`  | `/api/v1/backups/:filename/download` | Owner         | streams a backup file                                                   |
| `POST` | `/api/v1/backups/restore`            | Owner         | multipart upload of a backup file to restore                            |

---

## 6. Authentication and Authorization Flow

This is where Forkd diverges most from Norish, and the divergence is intentional. Norish authenticates users itself via Better Auth (password, OIDC, Google, GitHub). Forkd sits behind **Cloudflare Access**, which authenticates users _before_ requests reach the app, and we trust Cloudflare's identity-aware proxy headers. Better Auth still owns sessions, role flags, and the user record — it just gets its identity input from Cloudflare instead of doing the OAuth dance itself.

### 6.1 First-user bootstrap (before Cloudflare Access is configured)

This flow runs on a brand-new install where the database has zero users.

1. The Owner deploys Forkd via `docker-compose up`.
2. The Owner navigates to the public URL (which, at this stage, may not yet be behind Cloudflare Access — that's the whole point of bootstrap).
3. Forkd detects `SELECT COUNT(*) FROM users = 0` and renders the **bootstrap screen** (instead of any normal page).
4. The bootstrap screen asks for: email address, password (≥12 chars, complexity validated), first name, last name.
5. On submit, Better Auth creates the user, marks them `is_owner = true` and `is_admin = true`, and signs them in via session cookie.
6. Forkd sets a `bootstrap_complete = true` flag in `app_config`. From this moment on, the bootstrap screen is never shown again, and password auth is disabled (`PASSWORD_AUTH_ENABLED=false` effectively).
7. The Owner now sees the empty home screen and can begin configuring (or proceed to wire up Cloudflare Access).

**Norish mapping.** Direct adaptation of Norish's first-user bootstrap (Section 5 of `norish-reference.md`). The only material change is that we explicitly disable password auth after bootstrap, since the production identity source is Cloudflare Access.

### 6.2 Wiring up Cloudflare Access (operator action, not user-facing)

This is a one-time setup the Owner performs in the Cloudflare dashboard. It is documented in the README but not part of the app's runtime flow:

1. Create a Cloudflare Tunnel pointing at Forkd's local URL (e.g., `http://localhost:3000`).
2. Create a Cloudflare Access application gating the public URL.
3. Configure an identity provider in Cloudflare Access (Google, GitHub, one-time PIN — Cloudflare supports many).
4. Add an Access policy listing the email addresses (or domain) of family members.
5. Configure Cloudflare Access to send the `Cf-Access-Jwt-Assertion` and `Cf-Access-Authenticated-User-Email` headers to Forkd on every request.

### 6.3 Normal sign-in (Cloudflare Access path)

Once Cloudflare Access is in front of Forkd, every incoming request already carries a verified Cloudflare Access JWT.

1. Request arrives at Forkd with `Cf-Access-Jwt-Assertion` header.
2. **Cloudflare Access middleware** (custom code; see Section 11 of `norish-reference.md`, "build entirely from scratch") runs before any route handler:
   - Reads the JWT from the header.
   - Verifies the JWT against Cloudflare's JWKS endpoint, with the JWKS cached in memory for 1 hour.
   - Extracts the email and any name claims.
3. The middleware looks up the user in the `users` table by email:
   - **If found:** loads the user, attaches a Better Auth session to the request (issues a session cookie on first request), and continues.
   - **If not found:** creates a new user row (`is_admin = false`, `is_owner = false`), then attaches the session.
4. If `first_name` or `last_name` is empty on the user row, Forkd shows a one-time **"Welcome — what's your name?"** form before letting them into the rest of the UI.
5. Subsequent requests use the Better Auth session cookie; the Cloudflare middleware just re-verifies the JWT each request (cheap, JWKS is cached).

### 6.4 Authorization enforcement

Every tRPC procedure declares the minimum role it requires. Three helpers:

- `protectedProcedure` — requires any signed-in user.
- `adminProcedure` — requires `is_admin = true` or `is_owner = true`.
- `ownerProcedure` — requires `is_owner = true`.

Per-row rules (like "you can only delete your own photos unless admin") are enforced inside the procedure body using the rule encoded in the permissions matrix (Section 2).

**Critical:** RBAC is enforced **server-side on every request**. The UI hides controls the user cannot use, but every action the UI exposes is also checked server-side. Never trust the client.

---

## 7. AI and External API Integrations

All three external services are **optional**. Forkd must be fully functional for manual entry even with zero keys configured. When a service is configured, the relevant features light up. When it isn't, the UI either hides or disables the dependent button with a tooltip ("Configure a Claude API key in admin settings to enable this").

All API keys are stored in the `app_config` table with `is_secret = true`, encrypted at rest using `MASTER_KEY`. They are never logged. They are never sent to the browser. The admin UI displays them as `••••••••` and exposes a "Test connection" button instead of revealing the value.

### 7.1 Anthropic Claude API

**Used for.** Extracting structured restaurant metadata in two scenarios:

- After a Google Places lookup during manual add — Claude is given the Google Places result and asked to suggest a `cuisine_type` and `description`.
- After a social media transcription — Claude is given the transcript + scraped post text and asked to extract a restaurant name, location, cuisine, and short summary.

**When invoked.** Server-side only, inside the tRPC procedure or BullMQ worker that's handling the request.

**Credentials.** `app_config['ai.claude.api_key']`, encrypted. Settable in admin UI.

**Failure handling.** If Claude is unreachable, returns an error, or is not configured: the surrounding action still succeeds with the AI fields left empty. The user can fill them in manually. The error is logged but does not surface as a scary message unless the user explicitly tried to trigger AI.

**Norish mapping.** Follows the provider-abstracted pattern in Section 7 of `norish-reference.md`. We add an Anthropic adapter (`packages/api/src/ai/anthropic.ts`) alongside the OpenAI adapter shape. `AI_PROVIDER=anthropic` selects it.

### 7.2 OpenAI Whisper API

**Used for.** Transcribing audio extracted from social media videos.

**When invoked.** Inside the BullMQ social media import worker, after `yt-dlp` has downloaded the video and `ffmpeg` has extracted the audio track.

**Credentials.** `app_config['transcription.api_key']`, encrypted. Settable in admin UI.

**Failure handling.** If Whisper fails or is not configured, the import job fails with status `failed` and `error_message = "Transcription not configured"` (or the underlying error). The user sees this in the import status UI and can fall back to manual add.

**Norish mapping.** Same as Norish (Section 8 of `norish-reference.md`) — `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL=whisper-1`.

### 7.3 Google Places API

**Used for.** Two things:

- **Text Search** — when a user types a restaurant name + location during manual add.
- **Place Details (rating only)** — to fetch the current numeric rating snapshot for a restaurant.

**When invoked.** Server-side only, inside the relevant tRPC procedures (`restaurants.searchGooglePlaces`, `restaurants.refreshGoogleRating`).

**Credentials.** `app_config['google_places.api_key']`, encrypted. Settable in admin UI.

**Failure handling.**

- If the key is not configured: text search is disabled in manual add (user gets the blank form); Google rating is not fetched; refresh button is disabled with a tooltip.
- If a call fails: the existing data is preserved; the error is surfaced inline ("Could not refresh rating — try again later").

**Norish mapping.** No equivalent — this is one of the "build entirely from scratch" pieces (Section 11 of `norish-reference.md`).

**Security note.** The README must document that the Google Places API key be restricted to the server's IP in the Google Cloud Console, and that the user enable billing alerts. Google's $200/month free credit is more than enough for a family-scale app but a misconfigured key on a public repo can rack up costs fast — hence the IP restriction.

---

## 8. Social Media Import Flow

This is the most complex feature. The pipeline mirrors Norish's video import flow (Section 8 of `norish-reference.md`) with the LLM and prompt swapped.

### 8.1 Step by step

1. **User pastes a URL** into the "Import from social media" modal. Supported hosts: `tiktok.com`, `youtube.com`, `youtu.be`, `facebook.com`, `fb.watch`.
2. **The webapp container** receives the request via `import.start` tRPC mutation. It:
   - Validates the URL host against the allowed list.
   - Inserts a row into `import_jobs` with status `queued`.
   - Enqueues a BullMQ job (in Redis) with the job ID and URL.
   - Returns the job ID to the client immediately.
3. **The client** begins polling `import.status` every 2 seconds.
4. **The BullMQ worker** (running inside the webapp container) picks up the job and sets status `downloading`:
   - Calls **Playwright** to drive the `chrome-headless` container over WebSocket (CDP). Playwright loads the URL, waits for the page to settle, and extracts the page title, description, and any visible caption text (this becomes the "post text" we pass to Claude alongside the transcript).
   - Calls **`yt-dlp`** as a subprocess to download the video to a temp file. The download is bounded by `VIDEO_MAX_LENGTH_SECONDS` (default 120) — videos longer than this fail with a clear error.
5. **Status `transcribing`.** The worker:
   - Calls **`ffmpeg`** as a subprocess to extract the audio track (`-vn -acodec libopus`) to a smaller temp file.
   - Sends the audio to **Whisper** via the OpenAI SDK. Whisper returns the transcript.
6. **Status `extracting`.** The worker:
   - Builds a structured-output prompt for Claude containing the post text + transcript, asking for a JSON object with fields: `name`, `address_or_location`, `cuisine`, `description`, `confidence`.
   - Calls **Claude** via the Anthropic SDK.
   - Parses the JSON response.
   - **Optional second step:** if Google Places is configured, the worker runs the extracted name+location through Google Places text search to confirm a match and pull authoritative address/coordinates/place_id/rating. If no Places match, the extracted values are used as-is.
7. **Status `completed`.** The worker:
   - Creates a draft `restaurants` row with the populated fields, `status = want_to_try`, `social_url = original URL`, `added_by_user_id = the importing user`.
   - Sets `import_jobs.restaurant_id = new_row.id` and `import_jobs.status = completed`.
   - Cleans up all temp files (video, audio).
8. **The client** sees status `completed` on its next poll and redirects the user to the new restaurant's edit page where they can review, adjust, and save.
9. **On failure** at any step, the worker sets `import_jobs.status = failed`, populates `error_message`, cleans up temp files, and the client surfaces the error.

### 8.2 Why this shape

- **The work runs in a BullMQ worker, not the HTTP request.** Downloading + transcribing + LLM extracting takes 30–90 seconds; HTTP requests must not block that long.
- **The `chrome-headless` container is the largest attack surface** because it loads arbitrary URLs. Its port is not exposed on the host — only the `webapp` container can reach it over the internal Docker network. We must keep it that way.
- **Polling (not WebSockets) is fine for v1.** Norish uses Redis pubsub → WebSocket for real-time updates because their grocery list needs live sync. We have one user waiting on one job; polling every 2 seconds is simpler and works.

---

## 9. Docker Architecture

Forkd adopts Norish's four-container topology unchanged at the container level (Section 4 of `norish-reference.md`). Only the application image differs (it's Forkd, not Norish). Cloudflare Tunnel runs _outside_ this compose stack, either as a system service on the host or as a separate compose file.

### 9.1 Containers

#### `webapp` — the Forkd application

- **Image:** built locally from `docker/Dockerfile` in this repo. We do not publish to a registry initially.
- **Build context:** the repo root.
- **Ports:** `3000:3000` (only published locally for the Cloudflare Tunnel to reach; not exposed to the public internet directly).
- **User:** runs as UID/GID `1000:1000` (non-root).
- **Volume:** `app_uploads:/app/uploads` — persists photo uploads.
- **Volume:** `app_backups:/app/backups` — persists generated backup files.
- **Health check:** HTTP probe against `http://localhost:3000/api/v1/health`. Interval 1 min, timeout 15s, retries 3, start period 1 min.
- **Depends on:** `db`, `redis`.
- **Env:** see Section 10.

#### `db` — PostgreSQL

- **Image:** `postgres:17-alpine`.
- **Volume:** `db_data:/var/lib/postgresql/data`.
- **Env:** `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
- **No published port.** Only `webapp` reaches it on the internal network.

#### `redis` — cache + job queue

- **Image:** `redis:8.4.0`.
- **Volume:** `redis_data:/data`.
- **No published port.**

#### `chrome-headless` — for social media scraping

- **Image:** `zenika/alpine-chrome:latest`.
- **Command:** runs Chrome with `--remote-debugging-address=0.0.0.0 --remote-debugging-port=3000 --headless --no-sandbox --disable-gpu --disable-dev-shm-usage`.
- **No volumes** (stateless).
- **No published port.** Only `webapp` reaches it over the internal network on `ws://chrome-headless:3000`.

### 9.2 `docker-compose.yml` skeleton

```yaml
version: "3.9"

services:
  webapp:
    build:
      context: .
      dockerfile: docker/Dockerfile
    image: forkd:latest
    user: "1000:1000"
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000" # only bound to localhost; Cloudflare Tunnel reaches it
    env_file:
      - .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      CHROME_WS_ENDPOINT: ws://chrome-headless:3000
      UPLOADS_DIR: /app/uploads
      BACKUPS_DIR: /app/backups
    volumes:
      - app_uploads:/app/uploads
      - app_backups:/app/backups
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
      chrome-headless:
        condition: service_started
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: 60s
      timeout: 15s
      retries: 3
      start_period: 60s

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8.4.0
    restart: unless-stopped
    volumes:
      - redis_data:/data

  chrome-headless:
    image: zenika/alpine-chrome:latest
    restart: unless-stopped
    command:
      - --remote-debugging-address=0.0.0.0
      - --remote-debugging-port=3000
      - --headless
      - --no-sandbox
      - --disable-gpu
      - --disable-dev-shm-usage

volumes:
  app_uploads:
  app_backups:
  db_data:
  redis_data:
```

**Critical security note:** No `ports:` line on `db`, `redis`, or `chrome-headless`. They must remain reachable only on the internal Docker network. The `webapp` port is bound to `127.0.0.1` so it's reachable only by the local Cloudflare Tunnel daemon, never publicly.

---

## 10. Environment Variables

This list is the source of truth for `.env.example`. All real values stay in the operator's local `.env` file, which is **gitignored** and never committed.

### 10.1 Required core

| Variable            | Description                                                                                                                                                     | Example                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`      | Postgres connection string                                                                                                                                      | `postgres://forkd:CHANGE_ME@db:5432/forkd` |
| `MASTER_KEY`        | 32+ byte base64 key for encrypting in-DB secrets. Generate once with `openssl rand -base64 32`. **Back this up — losing it means losing all encrypted config.** | `CHANGE_ME_BASE64_KEY`                     |
| `AUTH_URL`          | Public URL of the instance                                                                                                                                      | `https://forkd.example.com`                |
| `POSTGRES_USER`     | DB username (used by compose)                                                                                                                                   | `forkd`                                    |
| `POSTGRES_PASSWORD` | DB password                                                                                                                                                     | `CHANGE_ME`                                |
| `POSTGRES_DB`       | DB name                                                                                                                                                         | `forkd`                                    |

### 10.2 Service URLs (default values usually correct)

| Variable             | Description                               | Default                     |
| -------------------- | ----------------------------------------- | --------------------------- |
| `REDIS_URL`          | Redis connection string                   | `redis://redis:6379`        |
| `CHROME_WS_ENDPOINT` | Headless Chrome CDP WebSocket             | `ws://chrome-headless:3000` |
| `UPLOADS_DIR`        | Where photo uploads live in the container | `/app/uploads`              |
| `BACKUPS_DIR`        | Where backup files live in the container  | `/app/backups`              |

### 10.3 Optional runtime

| Variable                   | Description                                                      | Default            |
| -------------------------- | ---------------------------------------------------------------- | ------------------ |
| `NODE_ENV`                 | `production` or `development`                                    | `production`       |
| `HOST`                     | Bind address                                                     | `0.0.0.0`          |
| `PORT`                     | Bind port                                                        | `3000`             |
| `TRUSTED_ORIGINS`          | Comma-separated extra origins allowed for authenticated requests | empty              |
| `SCHEDULER_CLEANUP_MONTHS` | Soft-delete retention (Norish pattern)                           | `3`                |
| `MAX_IMAGE_FILE_SIZE`      | Max bytes per uploaded photo                                     | `10485760` (10 MB) |
| `LOG_LEVEL`                | Pino log level                                                   | `info`             |

### 10.4 Authentication (bootstrap only)

| Variable                | Description                                           | Default |
| ----------------------- | ----------------------------------------------------- | ------- |
| `PASSWORD_AUTH_ENABLED` | `auto` enables until first user exists, then disables | `auto`  |
| `ENABLE_REGISTRATION`   | Allow non-Cloudflare-Access self-signup               | `false` |

### 10.5 Cloudflare Access integration

| Variable                | Description                                         | Example                               |
| ----------------------- | --------------------------------------------------- | ------------------------------------- |
| `CF_ACCESS_AUD`         | The Application Audience tag from Cloudflare Access | `5fe1c7f8e6d8...`                     |
| `CF_ACCESS_TEAM_DOMAIN` | The team subdomain used to fetch JWKS               | `mycompany.cloudflareaccess.com`      |
| `CF_ACCESS_ENABLED`     | Whether to enforce CF Access headers                | `false` for local dev, `true` in prod |

### 10.6 AI provider (mostly set via admin UI; envs are bootstrap-only)

| Variable         | Description                         | Default           |
| ---------------- | ----------------------------------- | ----------------- |
| `AI_ENABLED`     | Global on/off                       | `false`           |
| `AI_PROVIDER`    | `anthropic` (preferred) or `openai` | `anthropic`       |
| `AI_MODEL`       | Default model                       | `claude-opus-4-7` |
| `AI_TEMPERATURE` | Sampling temperature                | `1.0`             |
| `AI_MAX_TOKENS`  | Response cap                        | `4000`            |
| `AI_TIMEOUT_MS`  | Per-call timeout                    | `300000`          |

Note: `AI_API_KEY` is intentionally **not** in env vars in production. It lives only in `app_config` encrypted with `MASTER_KEY`. An env-level `AI_API_KEY` may be set during local dev for convenience.

### 10.7 Transcription (Whisper)

| Variable                 | Description            | Default     |
| ------------------------ | ---------------------- | ----------- |
| `TRANSCRIPTION_PROVIDER` | `openai` or `disabled` | `disabled`  |
| `TRANSCRIPTION_MODEL`    | Whisper model          | `whisper-1` |

### 10.8 Video import

| Variable                   | Description                             | Default          |
| -------------------------- | --------------------------------------- | ---------------- |
| `VIDEO_PARSING_ENABLED`    | Master switch for social media import   | `true`           |
| `VIDEO_MAX_LENGTH_SECONDS` | Cap on downloaded video length          | `120`            |
| `YT_DLP_VERSION`           | Pinned `yt-dlp` version                 | latest stable    |
| `YT_DLP_BIN_DIR`           | Where the binary lives in the container | `/usr/local/bin` |

### 10.9 PWA / app

| Variable          | Description               | Default   |
| ----------------- | ------------------------- | --------- |
| `APP_NAME`        | Displayed in the manifest | `Forkd`   |
| `APP_THEME_COLOR` | Manifest theme color      | `#0f172a` |

---

## 11. Backup and Restore Specification

Norish has no full backup/restore feature, so this is built fresh. The shape borrows from Norish's BullMQ scheduler pattern.

### 11.1 What a backup contains

A backup is a single `.tar.gz` archive named `forkd-backup-{ISO8601-UTC}.tar.gz` containing:

- `db.sql.gz` — a `pg_dump --format=custom` of the full Postgres database, gzipped.
- `uploads/` — a copy of the entire `UPLOADS_DIR`, preserving the `restaurants/{id}/...` directory structure.
- `app_config.json` — a JSON dump of the `app_config` table with **encrypted values left encrypted**. The backup is therefore safe only if `MASTER_KEY` is also backed up — they're useless without each other.
- `manifest.json` — backup metadata: app version, schema version, timestamp, included file counts, byte sizes.

### 11.2 How backups are generated

**Manual:** Owner clicks "Back up now" in `Admin Settings → Backup`. A BullMQ job is enqueued with high priority. On completion, the file appears in the backups list and is downloadable.

**Scheduled:** A cron-style schedule is configurable in admin UI (e.g., `0 3 * * *` for daily at 3 AM). A BullMQ recurring job runs `pg_dump`, tar's the uploads directory, writes the manifest, and stores the archive in `BACKUPS_DIR` inside the `app_backups` volume.

### 11.3 Retention

- A configurable retention policy (default: keep the last 30 backups, hard cap on disk usage at 10 GB).
- Backups exceeding the retention are pruned automatically by a daily cleanup job.

### 11.4 Restore procedure

Two paths.

**In-app restore (preferred, for non-developer Owners):**

1. Owner navigates to `Admin Settings → Backup → Restore`.
2. Uploads a `.tar.gz` backup file.
3. Forkd validates the manifest (schema version compatible? file structure intact?).
4. Forkd displays a confirmation: "This will replace all current data with the backup. Type RESTORE to confirm."
5. On confirm, Forkd: (a) puts itself in maintenance mode (a flag in `app_config` causing all non-Owner requests to return 503), (b) drops and recreates the database, (c) runs `pg_restore` on `db.sql.gz`, (d) replaces `UPLOADS_DIR` with the archived `uploads/`, (e) writes `app_config.json` back, (f) clears maintenance mode.
6. Owner is signed out and signs back in normally.

**Manual restore (documented in the README, for disaster recovery):**

1. `docker-compose down`
2. Extract backup tarball locally.
3. `docker-compose run db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists /backups/db.sql.gz`.
4. `docker cp uploads/. <webapp-container>:/app/uploads/`
5. Restore `app_config` rows from `app_config.json` (a documented `psql` script).
6. `docker-compose up`.

**Critical:** `MASTER_KEY` must match between the original and restored deployments, or all encrypted `app_config` values will be unreadable. The README will state this prominently.

---

## 12. Security Requirements

Aligned with the OWASP ASVS (Application Security Verification Standard) and OWASP Top 10. Every item below is enforced, not aspirational.

| Concern                              | Mitigation in this stack                                                                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken access control**            | RBAC enforced server-side on every tRPC procedure via `protectedProcedure` / `adminProcedure` / `ownerProcedure` wrappers. UI hiding is for UX only; the real check is server-side.                                               |
| **Cryptographic failures**           | Sessions HttpOnly + Secure + SameSite=Lax. `MASTER_KEY` encrypts `app_config` secrets at rest (AES-256-GCM). All traffic terminates at Cloudflare Tunnel over TLS. Passwords (bootstrap only) hashed with bcrypt via Better Auth. |
| **Injection**                        | Drizzle parameterizes all SQL — no string-built queries. All HTML rendering escapes by default (React). All user input validated with Zod schemas at the tRPC boundary.                                                           |
| **Insecure design**                  | This document is the design review. Threat model the social-media-import pipeline before shipping: the `chrome-headless` container is the largest attack surface.                                                                 |
| **Security misconfiguration**        | `db`, `redis`, `chrome-headless` ports unpublished. `webapp` bound to `127.0.0.1` only. CSP header (Next.js middleware) restricts script sources. HSTS via Cloudflare.                                                            |
| **Vulnerable / outdated components** | Renovate or Dependabot enabled on the repo. `pnpm audit` on CI. Pinned Docker image tags + periodic review.                                                                                                                       |
| **Auth failures**                    | All authentication delegated to Cloudflare Access in prod. Bootstrap password requires ≥12 chars with complexity. Session inactivity timeout 7 days.                                                                              |
| **Software & data integrity**        | All AI / external API responses validated against a Zod schema before being persisted. No `eval`. No dynamic `require`.                                                                                                           |
| **Logging & monitoring failures**    | Pino structured JSON logs (Norish standard). All auth events, admin actions, and import jobs logged with user id + timestamp. Secrets are filtered from log output by a Pino redact rule.                                         |
| **SSRF**                             | Social-media import URL validated against an allowlist of hosts (`tiktok.com`, `youtube.com`, `youtu.be`, `facebook.com`, `fb.watch`) before reaching `chrome-headless` or `yt-dlp`. No arbitrary URL fetching.                   |
| **No secrets in repo**               | `.env` and `*.env.local` gitignored. `.env.example` contains placeholders only. Pre-commit hook (`gitleaks` or `git-secrets`) scans for accidental secret commits. The repo is public; this is non-negotiable.                    |
| **EXIF / metadata leakage**          | EXIF stripped from photos on upload via Sharp.                                                                                                                                                                                    |
| **Rate limiting**                    | Cloudflare Access rate-limits incoming requests at the edge. Internal tRPC rate limits on import.start (max 5 jobs per user per hour) to prevent abuse of Whisper/Claude credits.                                                 |
| **File upload safety**               | MIME type validated against extension. Magic-byte sniffing. Server-generated filenames (UUIDs), never the client's filename. Max size enforced.                                                                                   |

---

## 13. PWA Requirements

Forkd adopts Norish's PWA approach (Section 9 of `norish-reference.md`) verbatim. Next.js doesn't ship a PWA layer; we wire one in.

### 13.1 What's needed

- **`public/manifest.json`** with: `name` ("Forkd"), `short_name` ("Forkd"), `description`, `start_url: /`, `display: standalone`, `background_color`, `theme_color`, and an icon set (192px, 512px, maskable variants).
- **Icons** for iOS (`apple-touch-icon`) and Android, generated from a single source image.
- **A service worker** that caches the app shell (HTML, JS, CSS, fonts) for offline loading. Adapted from Norish's `update-sw` script and built as part of the production build.
- **`<meta name="apple-mobile-web-app-capable" content="yes">`** and related Apple-specific meta tags in `app/layout.tsx`.
- **Install-prompt UI** — a small banner inviting the user to "Add to Home Screen" when the browser fires the `beforeinstallprompt` event.

### 13.2 Behavior on each platform

- **iOS (Safari):** user manually adds to home screen via the share menu; our manifest + meta tags ensure the standalone launch experience is correct.
- **Android (Chrome):** the browser offers an "Install app" option automatically once the manifest and service worker are detected.

### 13.3 Offline scope (v1)

The app shell loads offline (so the icon doesn't appear broken on a flaky connection), but data is fetched only when online. No offline-first sync in v1.

---

## 14. Implementation Phases

The phases below are sequenced so foundational layers are completed before dependents. Each phase ends in a working, testable state. **Claude Code should not skip ahead** — earlier phases are scaffolding the later ones depend on.

### Phase 0 — Project skeleton

- Initialize the pnpm + Turborepo monorepo with the workspaces listed in Norish's structure (`apps/web`, `packages/api`, `packages/auth`, `packages/config`, `packages/db`, `packages/queue`, `packages/shared`, `packages/trpc`, `packages/ui`).
- Set up Prettier, ESLint, Vitest, TypeScript configs at the root.
- Create the `docker/Dockerfile` and the minimal `docker-compose.yml` (Section 9).
- Create `.env.example` with all variables from Section 10 (placeholders only).
- Add `.gitignore` covering `.env`, `node_modules`, `.next`, build outputs, uploads, backups.
- Add the `gitleaks` pre-commit hook.
- **Done when:** `docker-compose up` brings up all four containers and the webapp shows a static "Hello world" page at `http://localhost:3000`.

### Phase 1 — Database + auth bootstrap

- Build the Drizzle schema for all tables in Section 4.
- Set up `drizzle-kit` and generate the initial migration.
- Wire up Better Auth with email+password provider only.
- Implement the bootstrap flow: empty users table → bootstrap form → first user becomes Owner.
- Implement the "Welcome — what's your name?" prompt for missing names.
- **Done when:** A fresh install lets you create the Owner, sign in, sign out, and reload without losing the session. Trying to visit a protected page when signed out redirects to sign-in.

### Phase 2 — Restaurants CRUD (manual entry only)

- tRPC procedures: `restaurants.list`, `restaurants.get`, `restaurants.create`, `restaurants.update`, `restaurants.delete`.
- UI: list page with filters (status, state, cuisine, added-by), detail page, add-form page, edit-form page.
- Cuisines list with seed data.
- Authorization enforced per Section 2.
- **Done when:** Multiple test users can add, edit, and delete restaurants; non-adders cannot delete others' entries; admins can.

### Phase 3 — Family ratings and reviews

- `reviews.upsert`, `reviews.delete` procedures + UI on the restaurant detail page.
- Family average rating displayed.
- Unique constraint enforced.
- **Done when:** Each user can leave exactly one rating + review per restaurant; the detail page shows everyone's reviews.

### Phase 4 — Photos

- `POST /api/v1/photos/upload` REST endpoint.
- Sharp pipeline (resize, EXIF strip, WebP, thumbnail).
- `photos.list`, `photos.delete` procedures + UI.
- Volume mount tested.
- **Done when:** Photos can be uploaded, displayed in a gallery on the detail page, deleted by uploaders/admins; restart preserves them.

### Phase 5 — Cloudflare Access integration

- Cloudflare Access middleware: JWT verification against JWKS, user lookup/auto-create, session attachment.
- Password auth disabled after bootstrap.
- Documentation in README for the Cloudflare-side setup.
- **Done when:** With `CF_ACCESS_ENABLED=true` and a valid `Cf-Access-Jwt-Assertion` header, new users are auto-created and signed in; without the header, requests are rejected.

### Phase 6 — Admin UI and config

- Admin settings UI (HeroUI tabs): Users, AI, Google Places, Backup, About.
- `users.*` procedures and the user management table.
- `config.*` procedures with encrypted-at-rest secrets.
- Test buttons for each external service.
- **Done when:** Owner can promote/demote admins; admins can paste API keys and click "Test connection" to verify them.

### Phase 7 — AI metadata via Claude (manual add path)

- Anthropic SDK adapter in `packages/api/src/ai/anthropic.ts`.
- Claude prompt for cuisine + description suggestion.
- Wire into the "Add restaurant" flow as an optional auto-fill step.
- **Done when:** With a valid Claude key configured, adding a restaurant via Google Places result yields a Claude-suggested cuisine + description.

### Phase 8 — Google Places integration

- Server-side Google Places client (`packages/api/src/external/google-places.ts`).
- `restaurants.searchGooglePlaces` query for manual add.
- `restaurants.refreshGoogleRating` mutation for the detail page button.
- Auto-fetch on initial restaurant creation when a place is selected.
- **Done when:** Manual add starts with a Places search; rating snapshots can be refreshed; everything fails gracefully without a key.

### Phase 9 — Map view

- Leaflet + OpenStreetMap component in `packages/ui`.
- `/map` page with the same filter state shape as the list page.
- Color-coded markers by status.
- **Done when:** Filtered restaurants with coordinates render on a pan-and-zoomable map; clicking a marker links to the detail page.

### Phase 10 — Social media import pipeline

- BullMQ queue setup in `packages/queue`.
- `import.start`, `import.status` procedures.
- Worker pipeline: Playwright (against `chrome-headless`) → yt-dlp → ffmpeg → Whisper → Claude → draft restaurant.
- URL host allowlist.
- Job status UI with polling.
- **Done when:** Pasting a real TikTok/YouTube/Facebook restaurant video URL produces a draft restaurant entry within ~90 seconds.

### Phase 11 — Backup and restore

- `pg_dump` + tarball backup job in `packages/queue`.
- `backups.*` procedures.
- Admin UI: Backup tab with "Back up now", backup list, schedule editor, restore upload.
- REST endpoints for download and restore upload.
- Maintenance-mode mechanism for restore.
- **Done when:** Owner can take a manual backup, download it, restore it on a fresh install, and end up with identical state.

### Phase 12 — PWA polish

- `manifest.json`, icons, Apple meta tags.
- Service worker (adapted from Norish).
- Install prompt banner.
- **Done when:** Forkd is installable on iOS Safari and Android Chrome, launches standalone, shows the correct icon and name.

---

## Appendix A — Decisions deferred to v2

- Real-time updates via Redis pubsub + WebSocket (Norish has this; we use polling in v1).
- i18n (English only in v1).
- A native mobile app (Expo) — PWA is sufficient.
- Per-restaurant visibility policies (we ship "everyone sees everything").
- A Google rating history table (we store only the latest snapshot in v1).
- Multi-household / multi-tenancy (single family group in v1).
- Recipe-style structured-data parsing for restaurant webpages (no equivalent schema.org type exists for restaurants in the same useful way).
