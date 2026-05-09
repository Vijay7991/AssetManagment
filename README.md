# AssetHub

Self-hosted, multi-tenant asset management platform. Runs on your local network. Free for individuals.

**What you get:**

Core
- Email/password signup with auto-created tenant (workspace)
- Multi-user, multi-tenant — invite teammates, switch between workspaces
- Asset categories, asset types with **custom fields** (define your own schema)
- Asset CRUD with photos
- QR code generation per asset, printable labels
- Browser-based QR scanner (works on phone via HTTPS over LAN)
- Search + filter across assets
- Light/dark theme

Operational
- **Check-in / check-out / move** workflow with full movement history per asset
- **Maintenance tickets** — preventive, corrective, inspection — with status, priority, assignee, scheduling, cost
- **Audit log** — append-only, every write captured, filterable
- **In-app notifications** with unread bell + email copy
- **CSV import / export** — bulk-onboard from spreadsheets, export for reporting

All running on your local network, no cloud, no paid services.

---

## Prerequisites

You need **Docker Desktop** installed. That's the only hard requirement.

- Windows: https://www.docker.com/products/docker-desktop/
- Make sure WSL2 is enabled (Docker Desktop installer will offer this)

Optional for development:
- .NET 9 SDK if you want to run the API outside Docker
- Node.js 20 if you want to run the web app outside Docker

---

## Quick start

```bash
# 1. Copy env file
cp .env.example .env

# 2. Edit .env — only thing you MUST change is JWT_SECRET (random 32+ char string)
#    On Windows PowerShell, generate one with:
#    [Convert]::ToBase64String((1..48 | %{Get-Random -Max 256}))

# 3. Boot the stack
docker compose up -d

# 4. Open in browser
#    From this machine:        https://localhost
#    From phone on same Wi-Fi: https://<your-LAN-IP>
#
# The API auto-creates the database schema on first start. Watch logs with:
#    docker compose logs -f api
```

To find your LAN IP on Windows:

```powershell
ipconfig | findstr IPv4
```

Pick the address starting with `192.168.` or `10.`.

---

## First time on your phone

The site uses HTTPS with a self-signed certificate (Caddy's internal CA). Your phone will warn you the connection is "not private" — that's expected on a LAN. Tap **Advanced → Proceed**. The certificate only lives on your network.

Why HTTPS at all? Because mobile browsers refuse to grant camera permission on plain HTTP, and you need camera for QR scanning.

If the warning is too annoying for daily use, install Caddy's root cert on your phone (instructions below).

---

## What's in the stack

```
docker compose services:
  db      → PostgreSQL 16 with persistent volume
  api     → .NET 9 Web API (the brain)
  web     → Next.js 15 frontend
  mail    → MailHog (catches outbound email at http://localhost:8025)
  caddy   → HTTPS reverse proxy, exposes :443
```

Default ports:

| Service | URL | Notes |
|---|---|---|
| Web (HTTPS) | `https://localhost` or `https://<LAN-IP>` | Main app |
| Web (HTTP) | `http://localhost:3000` | No camera access |
| API | `http://localhost:5080/openapi/v1.json` | OpenAPI spec (paste into Postman/Bruno) |
| MailHog UI | `http://localhost:8025` | View signup verification emails |
| Postgres | `localhost:5432` | user/pass in `.env` |

---

## How it works

### Tenancy

When you sign up, you get a personal **Tenant** (workspace) automatically. You can:

- Stay solo — assets are private to you
- Invite teammates by email — they join your tenant with a Member role
- Belong to multiple tenants (e.g., your personal one + your employer's)
- Switch tenants from the sidebar

All assets, categories, tags, and files are scoped to the active tenant. The API enforces this on every request via the `tid` claim in the JWT.

### Asset model

```
AssetCategory  → tree of categories (e.g., "IT > Laptops")
AssetType      → template defining custom fields (e.g., "Laptop" type with fields: Serial, CPU, RAM)
Asset          → an instance of an AssetType, holds the values
AssetTag       → a barcode/QR identifier attached to an asset
                 (one asset can have multiple tags — re-tagging supported)
```

### Barcode flow

1. Create an asset → API auto-generates an `AssetTag` with a 10-character base32 code
2. Visit the asset page → click **Print Label** → opens a printable QR sheet
3. Stick the printed label on the physical asset
4. From your phone: open the app → tap **Scan** → point camera at the label
5. Asset detail loads instantly

The QR payload is `https://<your-host>/t/<code>` so even a stock camera app opens the right page if scanned from outside the app.

### Roles

For MVP, three roles exist per tenant:

- **Admin** — full control of tenant, can invite/remove users
- **Manager** — manage assets, categories, types
- **Member** — view + scan + check-in/out (read mostly)

Granular permissions and custom roles are Phase 2.

---

## Common tasks

### Reset everything

```bash
docker compose down -v   # -v wipes volumes (deletes all data)
docker compose up -d
docker compose exec api dotnet ef database update
```

### Tail logs

```bash
docker compose logs -f api
docker compose logs -f web
```

### Backup the database

```bash
docker compose exec db pg_dump -U assethub assethub > backup_$(date +%F).sql
```

### Restore

```bash
docker compose exec -T db psql -U assethub assethub < backup_2026-05-09.sql
```

### Update the app

```bash
git pull
docker compose build
docker compose up -d
# Schema migrations are auto-applied on startup
```

---

## Installing Caddy's root certificate on your phone

Optional, but eliminates the certificate warnings.

```bash
# 1. Copy the root cert out of the Caddy container
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt

# 2. Transfer caddy-root.crt to your phone (AirDrop, email, USB)
# 3. Install:
#    iOS:     Settings → General → VPN & Device Management → install profile, then
#             Settings → General → About → Certificate Trust Settings → enable
#    Android: Settings → Security → Encryption & credentials → Install a certificate → CA certificate
```

---

## Architecture at a glance

```
[ Phone / Laptop on LAN ]
            │ HTTPS (port 443)
            ▼
       [ Caddy ]──────────────────┐
            │                     │
            │ /api/*              │ everything else
            ▼                     ▼
      [ .NET 9 API ]        [ Next.js Web ]
            │
            ├──► [ PostgreSQL 16 ]   (asset data, users, tenants)
            ├──► [ Local volume ]    (uploaded photos)
            └──► [ MailHog ]         (signup/invite emails)
```

Everything in one Docker network. No external calls. Works offline once the images are pulled.

---

## What's NOT in here yet (next phases)

| Feature | Phase | Notes |
|---|---|---|
| Departments / warehouses (hierarchy) | 2.5 | Tree below Tenant; schema change |
| Reports + charts dashboard | 2.5 | After data shape stabilizes |
| Excel (XLSX) import beyond CSV | 2.5 | Requires NPOI or EPPlus dep |
| Native mobile app (RN/Expo) | 3 | Web PWA covers MVP |
| Offline-first sync | 3 | Needs WatermelonDB or similar |
| RFID/NFC | 4 | Hardware-dependent |
| AI predictive maintenance, OCR | 4 | Only after you have real usage data |
| SSO / SAML / SCIM | 3 | Enterprise tier |
| Dedicated DB-per-tenant SKU | 3 | Premium plan |

## Important: schema changes during development

The API uses `EnsureCreatedAsync` to provision the schema on first run. It does NOT
migrate an existing database when entities change. If you pull a new version that
adds tables/columns, reset the local DB:

```bash
docker compose down -v   # WIPES DATA
docker compose up -d
```

Switch to proper EF Core migrations before going to production with real data.

---

## Project layout

```
AssetHub/
├── docker-compose.yml
├── .env.example
├── README.md
├── api/                  # .NET 9 backend
│   ├── Dockerfile
│   ├── AssetHub.Api.csproj
│   ├── Program.cs
│   ├── appsettings.json
│   ├── Domain/           # Entities
│   ├── Infrastructure/   # DbContext, auth, tenant resolver
│   └── Features/         # Endpoint groups (Auth, Assets, Tags, Categories, Files)
├── web/                  # Next.js 15 frontend
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/          # App Router pages
│       ├── components/   # UI primitives + feature components
│       └── lib/          # API client, auth, utils
└── caddy/
    └── Caddyfile         # HTTPS termination + routing
```

---

## License

MIT. Use it, fork it, sell it.
