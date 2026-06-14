# Forkd — Deployment Guide

Forkd is a private, family-only restaurant tracker. It runs as four Docker containers orchestrated by a single `docker-compose.yml` file. This guide walks you from a blank server to a fully running instance.

---

## What you need before you start

| Requirement                      | Notes                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Linux server or NAS            | Any x86-64 machine with 1 GB+ RAM works. Raspberry Pi 5 (arm64) is not yet tested.                                                                                                                                                     |
| Docker Engine 24+                | [Install guide](https://docs.docker.com/engine/install/)                                                                                                                                                                               |
| Docker Compose v2                | Comes bundled with Docker Desktop. On Linux: `apt install docker-compose-plugin`                                                                                                                                                       |
| A domain name                    | Needed for auth callbacks and the Cloudflare Tunnel. A subdomain works fine (e.g. `forkd.yourdomain.com`).                                                                                                                             |
| Cloudflare account (recommended) | Free tier. Used to expose Forkd to the internet via Cloudflare Tunnel + restrict access to your family via Cloudflare Access. You can skip this for LAN-only use, but **do not expose port 3000 directly to the internet without it**. |

---

## Step 1 — Create a directory and grab the compose file

```bash
mkdir forkd && cd forkd
curl -O https://raw.githubusercontent.com/pmalcolm99/Forkd/main/docker-compose.yml
```

The compose file references the pre-built image from GitHub Container Registry. You do **not** need to clone the full repository or build anything yourself.

---

## Step 2 — Create your `.env` file

Copy this template into a file called `.env` in the same directory as `docker-compose.yml`. Fill in every value marked `CHANGE_ME`.

```env
# =============================================================================
# REQUIRED — fill these in before first boot
# =============================================================================

# Postgres credentials — pick any values, just keep them consistent
POSTGRES_USER=forkd
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=forkd

# DATABASE_URL is built from the variables above by docker-compose.yml automatically.
# You do not need to set it here.

# 32-byte random key that encrypts API keys stored in the database.
# Generate it with: openssl rand -base64 32
# BACK THIS UP — if you lose it, all stored API keys become unreadable.
MASTER_KEY=CHANGE_ME_BASE64_KEY

# The public URL where Forkd will be reachable.
# Must match the URL in your Cloudflare Tunnel (or local address if LAN-only).
AUTH_URL=https://forkd.yourdomain.com

# =============================================================================
# CLOUDFLARE ACCESS (required for internet-facing deployment)
# Leave CF_ACCESS_ENABLED=false while doing the initial bootstrap,
# then flip it to true after you have set up Cloudflare Access.
# =============================================================================

CF_ACCESS_ENABLED=false
CF_ACCESS_AUD=CHANGE_ME
CF_ACCESS_TEAM_DOMAIN=CHANGE_ME.cloudflareaccess.com

# =============================================================================
# OPTIONAL — sensible defaults, change if needed
# =============================================================================

NODE_ENV=production
LOG_LEVEL=info
PASSWORD_AUTH_ENABLED=auto
ENABLE_REGISTRATION=false
TRUSTED_ORIGINS=
SCHEDULER_CLEANUP_MONTHS=3
MAX_IMAGE_FILE_SIZE=10485760

# Port the app listens on. Controls both the container's listening port and
# the host-side binding — one value does both. Default is 3000.
PORT=3000

VIDEO_PARSING_ENABLED=true
VIDEO_MAX_LENGTH_SECONDS=120
YT_DLP_BIN_DIR=/usr/local/bin
```

> **`MASTER_KEY` is irreplaceable.** Store it somewhere safe (a password manager, an encrypted note). If the server dies and you restore from a database backup without this key, you will need to re-enter all API keys (Claude, Whisper, Google Places) through the admin UI.

---

## Step 3 — Update `docker-compose.yml` to use the published image

The default `docker-compose.yml` has `image: forkd:latest`, which refers to a locally built image. To use the pre-built image from GitHub Container Registry, open `docker-compose.yml` and change the `webapp` service's `image` line:

```yaml
webapp:
  image: ghcr.io/pmalcolm99/forkd:latest # ← replace "forkd:latest" with this
```

The published image URL is:

```
ghcr.io/pmalcolm99/forkd:latest
```

A new image is pushed automatically by CI on every commit to `main`. `latest` always points to the most recent passing build.

---

## Step 4 — Pull the image and start the stack

```bash
docker compose pull
docker compose up -d
```

On first boot, the `webapp` container automatically:

1. Runs any pending database migrations (creates all tables).
2. Seeds the 20 built-in cuisine categories.
3. Starts the Next.js server on port 3000.

Watch the logs to confirm a clean start:

```bash
docker compose logs -f webapp
```

You should see something like:

```
webapp  | Running 3 pending migrations...
webapp  | Migrations complete
webapp  | Seeded 20 cuisine types
webapp  | ▲ Next.js 16.x.x
webapp  | ✓ Ready in 2.3s
```

> If `webapp` exits immediately, check the logs for a specific error. The most common cause is a wrong `DATABASE_URL` (usually a typo in `POSTGRES_USER` or `POSTGRES_PASSWORD`).

---

## Step 5 — Create the Owner account (bootstrap)

Forkd detects that no users exist yet and shows a bootstrap screen on the first visit.

1. Open `http://SERVER_IP:3000` in a browser (or your domain if Cloudflare Tunnel is already set up).
2. You will see a **Create owner account** form — this only appears once, when the database is empty.
3. Enter your email, a strong password (12+ characters), first name, and last name.
4. Submit. You are now signed in as the Owner.

After the Owner account is created, password authentication is automatically disabled. All future logins go through Cloudflare Access (see Step 6).

> The bootstrap screen disappears permanently after the Owner is created. If you need to re-bootstrap (e.g. you wiped the database), stop the stack, delete the `db_data` Docker volume (`docker volume rm forkd_db_data`), and restart.

---

## Step 6 — Set up Cloudflare Tunnel + Access (recommended)

This section makes Forkd reachable on the internet while restricting it to your family's email addresses. Skip it if you only need LAN access.

### 6a — Install cloudflared on the server

```bash
# Debian/Ubuntu
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

For other platforms see the [cloudflared install docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

### 6b — Authenticate and create a tunnel

```bash
cloudflared tunnel login          # opens a browser — authorise it for your Cloudflare account
cloudflared tunnel create forkd   # creates the tunnel; note the tunnel ID printed
```

### 6c — Create a tunnel config file

Create `/etc/cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /root/.cloudflare/tunnels/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: forkd.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 6d — Create a DNS CNAME record

```bash
cloudflared tunnel route dns forkd forkd.yourdomain.com
```

### 6e — Run cloudflared as a service

```bash
cloudflared service install
systemctl enable --now cloudflared
```

### 6f — Create a Cloudflare Access Application

1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) → **Access** → **Applications** → **Add an application**.
2. Choose **Self-hosted**.
3. Set **Application domain** to `forkd.yourdomain.com`.
4. Under **Policies**, add an **Allow** policy with condition `Emails` → list each family member's email address.
5. After saving, go to the application's settings and copy the **Application Audience (AUD) tag**.

### 6g — Enable Cloudflare Access in your `.env`

```env
CF_ACCESS_ENABLED=true
CF_ACCESS_AUD=<AUD tag from step 6f>
CF_ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
AUTH_URL=https://forkd.yourdomain.com
```

Restart the stack to pick up the new env:

```bash
docker compose up -d
```

From now on, anyone reaching `forkd.yourdomain.com` must pass Cloudflare Access first. Only the email addresses in your policy can get through.

---

## Step 7 — Add optional API keys via the admin panel

Forkd's AI features (restaurant metadata suggestions, social media import) require API keys that are stored encrypted in the database — never in `.env`. Once you're signed in as the Owner:

1. Go to **`/admin`** (the link is in the header menu).
2. Open each tab and fill in the keys:

| Tab               | Key needed            | Feature unlocked                                                                                                      |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **AI (Claude)**   | Anthropic API key     | "Suggest metadata" on Add Restaurant form; social media import (AI extraction step)                                   |
| **Transcription** | OpenAI API key        | Social media import (audio transcription via Whisper)                                                                 |
| **Google Places** | Google Places API key | Google rating + map coordinates on restaurant detail; social media import (confirmation step); automatic cover photos |

All keys are encrypted with `MASTER_KEY` before being written to the database. They never appear in logs or environment variables.

### Getting an Anthropic API key

Sign up at [console.anthropic.com](https://console.anthropic.com). Create an API key and paste it into the **AI (Claude)** tab.

### Getting an OpenAI API key (for Whisper)

Sign up at [platform.openai.com](https://platform.openai.com). Create an API key and paste it into the **Transcription** tab.

### Getting a Google Places API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project, enable the **Places API (New)** for it.
3. Create an API key under **Credentials**. Restrict it to the **Places API (New)** to limit exposure.
4. Paste it into the **Google Places** tab.

---

## Step 8 — Add family members

Family members do not self-register. They get access by:

1. Having their email address in the Cloudflare Access allow-list (Step 6f).
2. Clicking the Forkd URL — Cloudflare Access authenticates them and passes their verified email to Forkd.
3. Forkd creates their account automatically on first visit (no password, no sign-up form).

If you are running without Cloudflare Access (LAN-only), have family members visit the app — the registration screen is shown to any new visitor when `ENABLE_REGISTRATION=true` in `.env`.

---

## Keeping Forkd up to date

A new image is published to `ghcr.io/pmalcolm99/forkd:latest` on every commit to `main`. To update:

```bash
docker compose pull
docker compose up -d
```

The app runs database migrations automatically on boot, so upgrades are safe to do in place. The old container is replaced in seconds.

---

## Backups

Forkd has a built-in backup feature: **Admin → Backup**. Clicking **Download backup** produces a `.tar.gz` containing a PostgreSQL dump and all uploaded photos. Store this somewhere safe (external drive, cloud storage).

To restore from a backup, use the **Restore** button on the same page and upload the `.tar.gz`.

For automated off-server backups, you can also `pg_dump` the database directly:

```bash
docker compose exec db pg_dump -U forkd forkd > forkd_backup_$(date +%Y%m%d).sql
```

---

## Troubleshooting

### The app shows a blank page or 500 error on first visit

Check the webapp logs:

```bash
docker compose logs webapp --tail=50
```

Common causes:

- `MASTER_KEY` is missing or not valid base64.
- `DATABASE_URL` cannot reach the `db` container (check `POSTGRES_USER`/`POSTGRES_PASSWORD`).
- Migrations failed (look for `ERROR` lines before `Ready`).

### The bootstrap screen doesn't appear

If you see a login screen instead of the bootstrap form, the database already has a user. Either use the existing owner credentials, or wipe and restart:

```bash
docker compose down
docker volume rm forkd_db_data
docker compose up -d
```

### Social media import always fails at "Scraping post..."

The Chrome headless container may not have started cleanly. Check:

```bash
docker compose ps
docker compose logs chrome-headless
```

If `chrome-headless` is restarting in a loop, your host may not support the `--no-sandbox` flag. Some VPS providers (notably OpenVZ-based) block this. KVM or bare-metal hosts work reliably.

### Photos aren't showing after an update

The `app_uploads` Docker volume persists across updates. If photos disappeared, check that the volume is still mounted:

```bash
docker volume inspect forkd_app_uploads
docker compose exec webapp ls /app/uploads/restaurants/
```

---

## Architecture at a glance

```
Internet
  └── Cloudflare Access (identity gate)
        └── Cloudflare Tunnel
              └── localhost:3000
                    └── webapp container (Next.js + BullMQ worker)
                          ├── db container (PostgreSQL 17)
                          ├── redis container (Redis 8.4)
                          └── chrome-headless container (headless Chrome)
```

All four containers share an internal Docker network. Only `webapp` has a published port (`127.0.0.1:3000`); `db`, `redis`, and `chrome-headless` are not reachable from outside the Docker network.

Uploaded photos and database data are stored in named Docker volumes (`app_uploads`, `app_backups`, `db_data`, `redis_data`) so they survive container restarts and image updates.
