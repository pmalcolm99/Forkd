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

---

## Optional — guest links for bill splitting (v1.2.0+)

**Read this section before turning guest links on.** It is the one place where Forkd is
deliberately reachable without Cloudflare Access, and it needs a change on the Cloudflare side
as well as a setting in the app.

### What guest links are

When you split a restaurant bill, everyone who has a Forkd account can open the normal share link
(`/s/<token>`) — Cloudflare Access authenticates them as usual, nothing special is needed.

A **guest link** (`/g/<token>`) is for the people at the table who don't have Forkd accounts: a
friend, a colleague, your kid. It lets exactly one named guest open exactly one bill and tick the
items they ordered.

### The trade-off, stated plainly

Cloudflare Access sits in front of the whole app. A guest with a secret link would be stopped at
the edge before Forkd ever sees the request — so making guest links work means **punching a hole
through Access for two path prefixes**. Once you do that, those two paths are reachable by anyone
on the internet who has the URL.

What limits the blast radius:

- A guest token is **32 random bytes** (256 bits). It is not guessable.
- A token is a **capability, not an identity**: it maps to one participant on one bill. It can
  read that bill and write that one person's item picks and paid flag. Nothing else.
- Tokens **expire** (30 days by default) and can be **revoked individually** from the People tab.
- The guest endpoints **never return an email address**, the bill creator's identity, or the
  family share token.
- Every rejection — bad token, expired token, deleted bill, feature disabled — returns an
  identical `404`, so a caller learns nothing from probing.
- Requests are rate-limited per IP + token, on top of Cloudflare's own edge limits.
- tRPC is **not** exposed. The guest endpoints are four narrow REST handlers written for this
  purpose; the entire tRPC router stays behind Access.

If you only ever split bills with people who already have Forkd accounts, **leave this off**. The
rest of the feature works fully without it.

### Step 1 — add a Bypass policy in Cloudflare

**Where:** Zero Trust dashboard → **Access** → **Applications**

Create a **new application** (don't edit the main Forkd one):

1. **Add an application** → **Self-hosted**
2. **Application name:** `Forkd guest links`
3. **Session Duration:** any value (it won't be used)
4. **Application domain:**

   | Subdomain | Domain                | Path  |
   | --------- | --------------------- | ----- |
   | `forkd`   | `familyrecipebook.us` | `g/*` |

5. **Next** → add a policy:
   - **Policy name:** `Public bypass`
   - **Action:** **Bypass**
   - **Include:** _Everyone_
6. Save.

That single prefix is the whole guest surface. The page, the form it posts to,
and the receipt photos all live under `/g/`, and every response is a complete,
self-contained HTML document with its styling inline and no JavaScript. Nothing
from `/_next/static/` — no app bundle, no stylesheet — is involved, so none of
it has to be exposed. Cloudflare matches the more specific application first,
so the rest of Forkd stays gated by your existing policy.

> This is deliberate. An earlier design used a normal Next.js page here, which
> dragged roughly twenty JavaScript chunks and a stylesheet along with it. Those
> stayed behind Access, so a guest received the page HTML and nothing else — an
> unstyled white screen showing only the header — while it looked perfectly fine
> to anyone whose browser already held a `CF_Authorization` cookie. Widening the
> bypass to cover `/_next/static/*` would have fixed it, but at the cost of
> exposing the whole front-end bundle. Making the page self-contained keeps the
> public surface to one prefix instead.

### Step 1b — stop Cloudflare challenging the guest path

**Where:** your domain → **Security** → **Bots** (and **Security** → **WAF**)

Once a path bypasses Access it becomes ordinary anonymous traffic, which means
Cloudflare's bot protection applies to it. If **Bot Fight Mode** is on, requests
to `/g/*` come back as `403` with a `cf-mitigated: challenge` header and a
"Just a moment…" interstitial. Most desktop browsers solve that silently; Safari
on iOS — especially with iCloud Private Relay enabled — often does not, and the
guest is stuck.

Check for it with:

```bash
curl -s -D - -o /dev/null "https://forkd.familyrecipebook.us/g/anytoken" | grep -i cf-mitigated
```

Any output means a challenge is being issued. To fix:

- **Free plan:** Bot Fight Mode is a single global switch with no per-path
  exclusions — turn it off (Security → Bots → Bot Fight Mode). Cloudflare Access
  still protects every other route, so this does not expose the app.
- **Pro and above:** keep Super Bot Fight Mode on and add a **WAF custom rule**
  with action **Skip** → _Super Bot Fight Mode_, matching
  `http.request.uri.path contains "/g/"`.

### Step 2 — turn the setting on in Forkd

**Where:** Forkd → **Admin** → **Bills** (owner only)

Set `receipts.guest_links_enabled` to `true`. Optionally adjust
`receipts.guest_link_ttl_days` (default `30`).

Until this is `true`, the guest endpoints return `404` even if the Cloudflare bypass exists — the
two controls are independent on purpose, so neither one alone opens anything.

### Step 3 — verify

Do this in a **private/incognito window**, or on a device that has never signed
in. Testing in your normal browser proves nothing: it already holds an Access
cookie, so everything will look fine even when it is broken for everyone else.

```bash
# The guest page must return 200 — not 302 (Access) and not 403 (bot challenge).
curl -s -o /dev/null -w '%{http_code}\n' https://forkd.familyrecipebook.us/g/anytoken

# ...and no challenge header on it.
curl -s -D - -o /dev/null https://forkd.familyrecipebook.us/g/anytoken | grep -i cf-mitigated

# The rest of the app must STILL be gated — this one should be 302.
curl -s -o /dev/null -w '%{http_code}\n' https://forkd.familyrecipebook.us/restaurants

# And the app bundle must STAY gated — 302 here is correct and expected.
curl -s -o /dev/null -w '%{http_code}\n' https://forkd.familyrecipebook.us/_next/static/chunks/main-app.js
```

Expected: `200`, no `cf-mitigated` line, `302`, `302`.

An unknown token returns a styled "this link isn't active" page, which is a
`200`-shaped success for this check — you are testing that Cloudflare lets the
request through, not that the token is real.

If the first is `302`, the Bypass policy path isn't matching. If it is `403`
with `cf-mitigated`, see Step 1b. If the third returns `200`, **remove the
Bypass policy immediately** — its path is too broad and the app is exposed.

### Turning it back off

Set `receipts.guest_links_enabled` to `false` in Admin → Bills. Existing guest links stop working
at once. Removing the Cloudflare application as well is belt-and-braces.
