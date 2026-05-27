# Cloudflare Access Setup

This guide configures Cloudflare Access as the authentication gate in front of Forkd.

## Pre-flight checklist (read before changing anything)

Before setting `CF_ACCESS_ENABLED=true` on a running Forkd instance, check your email situation:

1. **Know which email address you will use to sign in via Cloudflare.** This is the email from your Identity Provider (Google account, Cloudflare OTP email, Microsoft OIDC, etc.). It may differ from the email you used during the initial bootstrap (e.g., you bootstrapped with a local test address but your real account is `you@gmail.com`).

2. **If they differ, reconcile before flipping the flag.** You have two options:
   - **Preferred — update the existing owner's email before enabling CF Access:**

     ```sql
     UPDATE "user" SET email = 'your-cf-email@example.com' WHERE is_owner = true;
     ```

     Connect via: `docker compose exec db psql -U <POSTGRES_USER> -d <POSTGRES_DB>`

   - **Alternative — enable CF Access, sign in, then promote yourself:**
     After enabling, sign in with your CF Access email. Then run:
     ```sql
     UPDATE "user" SET is_owner = true, is_admin = true WHERE email = 'your-cf-email@example.com';
     ```
     Then optionally demote or delete the orphaned bootstrap user.

3. **Verify which account was provisioned as Owner after your first sign-in.** The webapp logs a `WARN` whenever the first user is provisioned as Owner:
   ```
   CF Access: first user provisioned as Owner — verify this is the intended Owner email
   ```
   Check with: `docker compose logs webapp | grep "Owner"`

---

## Step 1 — Create a Cloudflare Access application

1. Go to [Cloudflare Zero Trust dashboard](https://one.cloudflare.com/) → **Access** → **Applications** → **Add an application**
2. Choose **Self-hosted**
3. Fill in:
   - **Application name:** Forkd
   - **Session duration:** 24 hours
   - **Application domain:** `forkd.familyrecipebook.us`
4. Click **Next**

## Step 2 — Copy the Application Audience (AUD) tag

On the application detail page, copy the **Application Audience** value — a 64-character hex string. This becomes `CF_ACCESS_AUD` in your `.env`.

## Step 3 — Note your team domain

Your team domain is visible in **Settings** → **Custom Pages** or in the URL bar as `<team>.cloudflareaccess.com`. This becomes `CF_ACCESS_TEAM_DOMAIN` in your `.env`.

## Step 4 — Select Identity Providers

In the **Identity providers** tab of the application, select the IdPs already configured on your Cloudflare account:

- Google
- Cloudflare One-Time PIN (OTP)
- Microsoft OIDC

(These should already be set up from other apps on your account. If not, add them under **Settings** → **Authentication**.)

## Step 5 — Create an Access policy

1. **Policy name:** Family
2. **Action:** Allow
3. **Include rule:** Email — list each family member's email address
4. Click **Save**

Emails must exactly match what the IdP provides. Google accounts use the Gmail address; OTP uses whatever email you enter.

## Step 6 — Update your production .env

```dotenv
CF_ACCESS_ENABLED=true
CF_ACCESS_AUD=<64-char-hex-from-step-2>
CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
```

## Step 7 — Restart the webapp

```bash
docker compose up -d
```

## Step 8 — Verify

1. Visit `https://forkd.familyrecipebook.us` — you should be challenged by Cloudflare Access before reaching Forkd.
2. Sign in with one of the family email accounts.
3. Confirm the `forkd.session_token` cookie is set (check DevTools → Application → Cookies): it should be HttpOnly, Secure, SameSite=Lax.
4. Check the webapp logs for the provisioning message:
   ```bash
   docker compose logs webapp | grep "CF Access"
   ```
5. Confirm the healthcheck still passes without a CF token:
   ```bash
   curl https://forkd.familyrecipebook.us/api/v1/health
   ```
   Should return `200` (the health endpoint is allowlisted in middleware).
6. Confirm unauthenticated access is blocked:
   ```bash
   curl https://forkd.familyrecipebook.us/restaurants
   ```
   Should return `403 Access denied.` (middleware rejects the request with no CF JWT).

## Sign-out behavior

When a user clicks **Sign out**, Forkd:

1. Deletes the session row from the database
2. Clears the `forkd.session_token` cookie
3. Redirects to `https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/logout`

The Cloudflare logout step is required. Without it, Cloudflare silently re-issues the JWT on the next visit and the user appears to still be logged in.

---

## Cloudflare dashboard checks (verify these if you see redirect loops)

No dashboard changes are required for the basic setup, but the following settings can break the session flow if misconfigured:

### 1. Rocket Loader — must be OFF

**Where:** Your domain → **Speed** → **Optimization** → **Rocket Loader**

Rocket Loader rewrites `<script>` tags and defers their execution. It does not affect auth directly, but it can cause unexpected page behaviour and should be disabled for app domains.

### 2. Cache Rules — no "Cache Everything" on app paths

**Where:** Your domain → **Rules** → **Cache Rules**

Check that no Cache Rule matches `forkd.familyrecipebook.us/*` with action "Cache Everything." Cloudflare strips `Set-Cookie` headers from cached responses, which prevents the app's `forkd.session_token` cookie from reaching the browser.

The `/api/auth/cloudflare-sync` route already returns `Cache-Control: no-store` and uses a **200 response with `<meta http-equiv="refresh">`** (instead of a 302 redirect) specifically because Cloudflare can strip `Set-Cookie` from 3xx responses. A "Cache Everything" rule would override this protection.

If you do have Cache Rules, add an exception: match `forkd.familyrecipebook.us/api/auth/*` → **Bypass cache**.

### 3. Transform Rules — no Set-Cookie stripping

**Where:** Your domain → **Rules** → **Transform Rules**

Verify no Transform Rule modifies or removes `Set-Cookie` headers from origin responses.

### 4. Cloudflare Access cookie settings — leave at defaults

**Where:** Zero Trust dashboard → **Access** → **Applications** → Forkd → **Settings**

The `CF_Authorization` cookie set by Cloudflare Access for its own session tracking is separate from `forkd.session_token`. Do not configure "Cookie Settings" to restrict `forkd.*` cookies — leave all application cookie settings at their defaults.

### How to diagnose a redirect loop

If you see "Too many redirects" (`ERR_TOO_MANY_REDIRECTS`) after authentication:

1. Open DevTools → Network tab, check if `forkd.session_token` appears in the **Cookies** column of the response from `/api/auth/cloudflare-sync`.
2. If the cookie is absent: the Cloudflare edge may be caching the response. Add the Cache Rule exception above.
3. If the cookie is present but disappears on the next request: check that no Transform Rule strips it.
4. Check webapp logs: `docker compose logs webapp | grep "CF Access"` — if you see the provisioning message repeated many times, the session is being re-created on every visit, which means the cookie isn't reaching the session lookup.
