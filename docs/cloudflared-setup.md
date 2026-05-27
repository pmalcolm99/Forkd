# Cloudflared Tunnel Setup

This guide covers installing `cloudflared` on your home server and connecting it to the Cloudflare Tunnel that serves Forkd.

## Prerequisites

- A Cloudflare account with your domain (`familyrecipebook.us`) managed in Cloudflare DNS
- Forkd running locally via `docker compose up -d` (webapp listening on `127.0.0.1:3000`)

## 1. Install cloudflared

**Linux (Debian/Ubuntu):**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**macOS:**

```bash
brew install cloudflare/cloudflare/cloudflared
```

Verify: `cloudflared --version`

## 2. Authenticate

```bash
cloudflared tunnel login
```

This opens a browser window. Select the `familyrecipebook.us` zone. A credentials file is saved to `~/.cloudflared/cert.pem`.

## 3. Create the tunnel

```bash
cloudflared tunnel create forkd
```

This outputs a tunnel ID (UUID). Note it — you'll need it in step 5. A JSON credentials file is saved to `~/.cloudflared/<tunnel-id>.json`.

## 4. Create a DNS CNAME record

```bash
cloudflared tunnel route dns forkd forkd.familyrecipebook.us
```

This creates a `CNAME` record pointing `forkd.familyrecipebook.us` → `<tunnel-id>.cfargotunnel.com` in your Cloudflare DNS zone.

## 5. Create the config file

```bash
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: <tunnel-id>
credentials-file: /home/<your-user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: forkd.familyrecipebook.us
    service: http://localhost:3000
  - service: http_status:404
```

Replace `<tunnel-id>` and `<your-user>` with the actual values. The `docker-compose.yml` binds the webapp to `127.0.0.1:3000`, so `cloudflared` reaches it at `http://localhost:3000`.

## 6. Run as a systemd service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## 7. Verify

```bash
systemctl status cloudflared
```

Then test the public URL:

```bash
curl -I https://forkd.familyrecipebook.us/api/v1/health
```

Should return `HTTP/2 200`. (Before Cloudflare Access is configured, there is no authentication challenge yet — that is added in the next step.)

## Troubleshooting

- **Connection refused:** Confirm the webapp container is running — `docker compose ps` and check the `webapp` service shows `healthy`.
- **DNS not resolving:** The CNAME record may take a few minutes to propagate. Check with `dig forkd.familyrecipebook.us`.
- **Logs:** `journalctl -u cloudflared -f`

## Next step

With the tunnel working, configure Cloudflare Access authentication: see [cloudflare-access-setup.md](cloudflare-access-setup.md).
