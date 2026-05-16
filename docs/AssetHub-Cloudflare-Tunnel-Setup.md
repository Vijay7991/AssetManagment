# AssetHub — Public Hosting via Cloudflare Tunnel (Free)

Step-by-step guide to expose your local Docker stack to the public internet, with HTTPS, no port forwarding, no public IP, no router changes. All free.

---

## What you'll end up with

- AssetHub reachable at `https://assethub.yourdomain` from anywhere
- Real Let's Encrypt-style HTTPS (Cloudflare's edge certificate)
- Your PC stays behind your home router — no inbound ports open
- DDoS protection, caching, and WAF for free

---

## Part 0 — Pick your domain path

| Path | Cost | Time to live | Notes |
|---|---|---|---|
| **A. TryCloudflare** | $0 | 5 min | Random URL like `red-fox-123.trycloudflare.com`. Changes on restart. Best for testing. |
| **B. eu.org** | $0 | 2–3 weeks | Real free domain. Manual approval. Works with Cloudflare. |
| **C. .xyz from Cloudflare Registrar** | ~$1–2/year | 10 min | Effectively free. Cleanest experience. **Recommended.** |
| **D. Namecheap .xyz / .top** | ~$1–2/year first year | 10 min | Same as C but via a different registrar. |

The rest of this guide assumes **Path C** (you own a real domain on Cloudflare). If you're on **Path A**, jump to Appendix A at the bottom.

---

## Part 1 — Cloudflare account + domain

### 1.1 Create the account

1. Go to <https://dash.cloudflare.com/sign-up>
2. Sign up with email + password
3. Verify your email

### 1.2 Get a domain

**Option C — Buy on Cloudflare Registrar (recommended):**

1. In the Cloudflare dashboard sidebar, click **Domain Registration → Register Domains**
2. Search for something cheap: try `assethub-vijay.xyz`, `vijayhub.xyz`, etc. (.xyz is usually the cheapest TLD)
3. Add to cart, pay with card — domain is added to your Cloudflare account automatically. No DNS migration needed.

**Option B — eu.org (slower but free):**

1. Apply at <https://nic.eu.org/>
2. Wait 2–3 weeks for approval
3. Once approved, add the domain to Cloudflare:
   - Dashboard → **Add a site** → enter your domain → Free plan
   - Copy the two Cloudflare nameservers shown
   - In your eu.org admin panel, set those as the domain's nameservers
   - Wait for propagation (Cloudflare emails you when active)

---

## Part 2 — Create the Cloudflare Tunnel

1. In the Cloudflare dashboard sidebar, click **Zero Trust** (left menu, sometimes under "Account Home")
2. First time: you'll be asked to pick a team name. Pick anything (e.g. `vijay-personal`). Choose the **Free** plan.
3. In Zero Trust, go to **Networks → Tunnels → Create a tunnel**
4. Connector type: **Cloudflared** → **Next**
5. Tunnel name: `assethub` → **Save tunnel**
6. On the "Install and run a connector" screen, **don't** install anything yet. Just copy the long token shown in the docker command — it looks like:
   ```
   eyJhIjoiXXXXXXXXX...very long string...
   ```
   Save this — we'll paste it into `.env` in the next step.
7. Click **Next** (don't worry that no connector is running yet — Docker will start it).
8. **Public Hostnames** screen — fill in:
   - **Subdomain:** `assethub` (or whatever you want — `app`, `inventory`, etc.)
   - **Domain:** pick your domain from the dropdown
   - **Service Type:** `HTTP`
   - **URL:** `caddy:80`
   
   Then **Save tunnel**.

You now have `https://assethub.yourdomain.xyz` ready — but nothing's running yet on your end.

---

## Part 3 — Update your project

### 3.1 Add the tunnel token to `.env`

Open `D:\Projects\Asset Managment\.env` and add at the bottom:

```env
CF_TUNNEL_TOKEN=eyJhIjoiXXXXXXXXX...paste the whole token here...
PUBLIC_HOSTNAME=assethub.yourdomain.xyz
```

(Replace with your real token and your real hostname.)

### 3.2 Add the `cloudflared` service to `docker-compose.yml`

Open `D:\Projects\Asset Managment\docker-compose.yml` and add this service alongside the others:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: assethub-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
    depends_on:
      - caddy
    networks:
      - default
```

No ports need to be exposed — cloudflared makes an **outbound** connection to Cloudflare's edge.

### 3.3 Update the `Caddyfile`

Open `D:\Projects\Asset Managment\caddy\Caddyfile`. Cloudflare terminates TLS at the edge, so Caddy can serve plain HTTP internally to the tunnel.

Replace the existing public-facing block with:

```caddy
# Public hostname — terminated by Cloudflare, served plain HTTP to the tunnel
http://{$PUBLIC_HOSTNAME} {
    handle /api/* {
        reverse_proxy api:8080
    }
    handle {
        reverse_proxy web:3000
    }
}

# Keep your existing LAN block for local testing
https://localhost, https://192.168.1.0/24 {
    tls internal
    handle /api/* {
        reverse_proxy api:8080
    }
    handle {
        reverse_proxy web:3000
    }
}
```

Pass the env var into Caddy by editing the `caddy` service in `docker-compose.yml`:

```yaml
  caddy:
    # ...existing config...
    environment:
      - PUBLIC_HOSTNAME=${PUBLIC_HOSTNAME}
```

### 3.4 Update CORS and the web's API base URL

In `.env` (or wherever you set them), update:

```env
Cors__AllowedOrigins__0=https://assethub.yourdomain.xyz
NEXT_PUBLIC_API_URL=https://assethub.yourdomain.xyz/api
```

(Adjust to match how your project actually reads these — check `appsettings.json` and the Next.js env files.)

### 3.5 Tighten secrets before going public

This is the production-hardening list from the main doc. Do it **before** the first public boot, not after:

```powershell
# Regenerate JWT secret (PowerShell)
$secret = [Convert]::ToBase64String((1..48 | %{Get-Random -Max 256}))
(Get-Content .env) -replace 'JWT_SECRET=.*', "JWT_SECRET=$secret" | Set-Content .env

# Regenerate Postgres password (do this BEFORE the first ever boot, or you'll need to drop the volume)
$pgpass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | %{[char]$_})
(Get-Content .env) -replace 'POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$pgpass" | Set-Content .env
```

Also set in `.env`:
```env
ASPNETCORE_ENVIRONMENT=Production
```

---

## Part 4 — Boot the stack

```powershell
cd "D:\Projects\Asset Managment"
docker compose pull cloudflared
docker compose up -d --build
docker compose logs -f cloudflared
```

You should see something like:
```
Registered tunnel connection ... connIndex=0 ...
Registered tunnel connection ... connIndex=1 ...
```

That means cloudflared is connected to Cloudflare's edge and routing your hostname to Caddy.

### Verify

1. Open `https://assethub.yourdomain.xyz` in any browser, on any network
2. Sign up — first user becomes the Owner
3. From your phone (on cellular, **not** Wi-Fi) — open the same URL. It should work identically.

---

## Part 5 — Day-to-day operations

### Restarting

```powershell
docker compose restart cloudflared
```

The tunnel reconnects automatically — same public URL.

### Tunnel status

Cloudflare dashboard → Zero Trust → Networks → Tunnels → click `assethub`. Shows connection health, recent requests.

### Logs

```powershell
docker compose logs -f cloudflared
docker compose logs -f caddy
docker compose logs -f api
```

### Updating

```powershell
docker compose pull
docker compose up -d --build
```

### Stopping (taking it offline)

```powershell
docker compose stop cloudflared
```

Site goes 502 in seconds. Restart with `docker compose start cloudflared`.

---

## Part 6 — Mobile app

In `mobile/`, when the app prompts for "Server URL" on first launch, enter:
```
https://assethub.yourdomain.xyz
```

That's it — the health probe will pass and the app will work over cellular from anywhere.

---

## Part 7 — Important caveats

- **Your PC must be on and online** for the site to be reachable. Sleeping the laptop = site down.
- **Cloudflare Free plan ToS** prohibits using their CDN to serve large amounts of non-HTML content (video streaming, large file downloads). For an asset-management app with photos this is fine, but don't run a media hosting service through it.
- **No incoming email** — Cloudflare Tunnel is HTTP(S) only. Outbound SMTP through Brevo/Resend works as normal.
- **Database backups** — set up a daily `pg_dump` cron / scheduled task to back up off your machine (OneDrive, Google Drive, S3 free tier). One bad SSD and you lose everything.
- **First-run secret rotation** — if you change `POSTGRES_PASSWORD` after the volume already exists, Postgres will reject the new password. Either change it before the very first boot, or `docker compose down -v` to nuke the volume and start fresh.

---

## Part 8 — Bonus: hardening that's worth doing

Once it's working publicly, knock out the rest of the production checklist:

- [ ] Real SMTP — sign up for **Brevo** (300 emails/day free) or **Resend** (3,000/month free). Swap the MailHog block in compose for SMTP env vars on the api service.
- [ ] **Cloudflare Access** (Zero Trust → Access → Applications) — put a Google-SSO login wall in front of the whole site so only your email can reach AssetHub. Free for up to 50 users. Adds a second auth layer before your own JWT login.
- [ ] **Rate limiting** at Cloudflare — WAF → Rate limiting rules → 100 requests/min from a single IP to `/api/auth/*`. Blocks brute force.
- [ ] **Daily Postgres backup** — see the script in the Developer Guide.
- [ ] **EF Core Migrations** — switch off `EnsureCreated` before you have real customer data.
- [ ] **Sentry** — free tier, drop the DSN into the .NET app for crash visibility.

---

## Appendix A — TryCloudflare (zero domain, instant)

If you just want to share the site with someone for 30 minutes:

```powershell
docker run --rm -it --network assetmanagment_default cloudflare/cloudflared:latest tunnel --url http://caddy:80
```

It prints a random `https://something-random.trycloudflare.com` URL. Use that as your `PUBLIC_HOSTNAME` and update CORS. URL changes every time you restart.

For permanent use, do the full setup above instead.

---

## Appendix B — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error 1033 — Argo Tunnel error` | cloudflared not running | `docker compose logs cloudflared` — check for token errors |
| Site loads but API calls fail | CORS or `NEXT_PUBLIC_API_URL` still pointing at `localhost` | Update env, rebuild web container |
| `502 Bad Gateway` from Cloudflare | Public hostname pointing at wrong service URL | In Zero Trust tunnel config, set service to `http://caddy:80`, not `https://` |
| Mobile app says "can't connect" | URL typo or http vs https | Must be `https://...` with no trailing slash |
| Random 522 errors after working fine | Your home internet hiccup | cloudflared auto-reconnects; usually self-heals in seconds |
| Caddy in restart loop | `tls internal` block trying to fetch certs | Make sure the public hostname block uses `http://`, not `https://` |

---

*Last updated: May 2026. Free-tier limits and Cloudflare UI may have shifted slightly — check the dashboard if a step looks off.*
