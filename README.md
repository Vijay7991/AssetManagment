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
- **Per-unit tracking** — turn on "Track each unit individually" for an asset type and every physical instance gets its own barcode, IMEI/serial, warranty, status and check-out lifecycle. 1-of-10 partial checkout works out of the box
- **Maintenance tickets** — preventive, corrective, inspection — with status, priority, assignee, scheduling, cost
- **Audit log** — append-only, every write captured, filterable
- **In-app notifications** with unread bell + email copy
- **CSV import / export** — bulk-onboard from spreadsheets, export for reporting

Accounts & access
- **Self-service password reset** — `Forgot password?` on the login screen emails a 1-hour token
- **Change your own password** from Settings (current password required)
- **Tenant admins** can deactivate / reactivate members and trigger password resets per workspace
- **Root admin** — a single platform-level operator (bootstrapped from `ROOT_ADMIN_EMAIL`) who can see every account on every workspace, activate/deactivate them, promote others to root, and force-reset passwords
- Deactivating an account immediately revokes its refresh tokens — the user is signed out everywhere on the next refresh

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
AssetType      → template defining custom fields + TrackByUnit default
Asset          → an instance of an AssetType, holds the shared values
AssetUnit      → one physical instance of a unit-tracked Asset, owns
                 its own identity (serial/IMEI), status, location,
                 warranty, assignment, and barcode
AssetTag       → a barcode/QR identifier attached to an asset OR a
                 specific unit (one asset/unit can have multiple)
```

### Unit tracking (per-instance identity)

For asset types where each physical instance has its own identity — phones with
unique IMEIs, laptops with serials, vehicles with VINs — toggle **Track each
unit individually** on the asset type. From then on:

- Creating an asset with quantity 10 spawns 10 `AssetUnit` rows, each with its
  own auto-generated barcode/QR
- At create time the form shows an optional grid so you can fill IMEI/serial
  and warranty per row, or leave it blank and fill in later from each unit's page
- Each unit has its own status (`InService` / `InRepair` / `Lost` / …), location,
  assignee and movement history
- Scanning a unit's barcode opens that specific unit's page, not the parent
- **Partial check-out works** — the "Check out units" button opens a dialog
  where you tick the units to check out (or scan their barcodes to add). Same
  for check-in. The asset card shows `n of N available`
- Photos and maintenance tickets stay at the parent-asset level for now —
  per-unit photos/tickets are a future addition

Bulk consumables (printer paper, cables) keep the simple quantity-based flow
by leaving the toggle off.

### Barcode flow

1. Create an asset → API auto-generates an `AssetTag` with a 10-character base32 code
2. Visit the asset page → click **Print Label** → opens a printable QR sheet
3. Stick the printed label on the physical asset
4. From your phone: open the app → tap **Scan** → point camera at the label
5. Asset detail loads instantly

The QR payload is `https://<your-host>/t/<code>` so even a stock camera app opens the right page if scanned from outside the app.

### Roles

For MVP, three roles exist per tenant:

- **Admin** — full control of tenant, can invite/remove users, deactivate accounts, reset passwords
- **Manager** — manage assets, categories, types
- **Member** — view + scan + check-in/out (read mostly)

On top of those, one platform-level **Root admin** can see and manage every account across every workspace. Set `ROOT_ADMIN_EMAIL` in `.env` to whichever account should hold that role — it's promoted automatically on signup or on the next API restart if the account already exists.

Granular permissions and custom roles are Phase 2.

### Setting up the root admin

1. Put your email in `.env`:
   ```
   ROOT_ADMIN_EMAIL=you@example.com
   ```
2. Boot the stack — `docker compose up -d`
3. Sign up at `https://localhost` with **that exact email**. You'll get the **Admin** sidebar entry automatically.
4. If you already had an account before setting the env var, just restart the API (`docker compose restart api`) — it'll promote you on startup.

Demote yourself with the "Demote" button on another root admin's row. The system refuses to leave you with zero root admins.

### Password reset

Self-service: hit **Forgot password?** on the login screen → check MailHog at `http://localhost:8025` for the reset link in development.

Admin-initiated: from `/members` (workspace admin) or `/admin` (root admin), click **Reset password** on any user row. The link is emailed and also shown inline so you can copy it directly when MailHog isn't being watched.

Reset tokens are single-use, expire in 1 hour, and revoke all active refresh tokens on success — sign-out everywhere.

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

### Backup and restore

The repo ships with three helper scripts in `scripts/` (a `.sh` and a `.ps1` for each one, pick whichever matches your shell). They wrap the right `docker compose exec` invocations so you don't have to remember them.

**Take a backup** — runs `pg_dump` inside the db container, writes a timestamped `.sql` file to `./backups/`. Read-only, safe to run while the app is up.

```bash
# Linux / macOS / WSL
./scripts/backup.sh
./scripts/backup.sh nightly     # adds the 'nightly' tag to the filename

# Windows PowerShell
.\scripts\backup.ps1
.\scripts\backup.ps1 -Tag nightly
```

**Restore a backup** — overwrites the current database with a dump. Prompts for confirmation (type `restore`) and stops the API for the duration of the load so writes don't race.

```bash
# Linux / macOS / WSL
./scripts/restore.sh ./backups/assethub_2026-05-16_14-30-00.sql
./scripts/restore.sh ./backups/assethub_2026-05-16_14-30-00.sql --yes  # skip prompt

# Windows PowerShell
.\scripts\restore.ps1 .\backups\assethub_2026-05-16_14-30-00.sql
.\scripts\restore.ps1 .\backups\assethub_2026-05-16_14-30-00.sql -Yes
```

**Safe rebuild** — for the days where you've pulled a release that changes the schema and would otherwise need a destructive `down -v`. The wrapper backs up automatically, then wipes, rebuilds, and brings the stack back up. Restore your data with `restore.sh` after.

```bash
# Linux / macOS / WSL
./scripts/safe-rebuild.sh

# Windows PowerShell
.\scripts\safe-rebuild.ps1
```

Backups live in `./backups/` and are gitignored — they contain user PII and password hashes, never commit them.

### Update the app

```bash
git pull

# If the release notes say "schema changed", use safe-rebuild — it backs up first.
./scripts/safe-rebuild.sh          # bash
# .\scripts\safe-rebuild.ps1       # PowerShell

# Otherwise (code changes only, no schema diff), a normal rebuild preserves data:
docker compose up -d --build
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
migrate an existing database when entities change — so `docker compose up -d --build`
on its own will leave your DB on the OLD schema and the new code's queries will
500 (you'll see things like "assets disappear from the list while counts still show",
because only the queries that touch new columns fail).

You have two ways out:

**Preferred — apply the SQL migration (preserves data).** The repo ships a
hand-written migration script that idempotently adds the new columns/tables.
Safe to run on any older version of the schema:

```bash
./scripts/migrate.sh                # bash       — backs up, applies, restarts API
# .\scripts\migrate.ps1             # PowerShell

# Skip the auto-backup if you already have one:
./scripts/migrate.sh ./scripts/migrate-2026-05-units.sql --no-backup
```

**Fallback — wipe and start fresh.** Use this if a migration script isn't
available for the release you're upgrading to:

```bash
./scripts/safe-rebuild.sh           # bash    — auto-backs-up, then down -v + up
# .\scripts\safe-rebuild.ps1        # PowerShell

# Then optionally restore data INTO THE OLD SHAPE (note: drops the new schema):
./scripts/restore.sh ./backups/assethub_pre-rebuild_<timestamp>.sql
```

The restore step only works if the table shapes happen to be compatible. When the
release added or renamed columns the dump's `INSERT`s will fail on the missing
columns — at that point you're better off keeping the dump for reference and
re-entering or re-importing your data.

> **Upgrading to the accounts release?** This version adds three new columns to
> `Users` (`IsActive`, `IsRootAdmin`, `DeactivatedAt`) and a new
> `PasswordResetTokens` table. The shape is additive so an old dump can usually
> be restored cleanly into the new schema — the new columns just take their
> defaults (active=true, root=false).

> **Upgrading to the unit-tracking release?** This version adds a new
> `AssetUnits` table plus three new columns on existing tables: `Assets.IsUnitTracked`,
> `AssetTypes.TrackByUnit`, `AssetTags.UnitId`, `AssetMovements.UnitId`. All
> additive. After `safe-rebuild` you can restore the old dump and existing
> assets simply stay in non-unit-tracked mode — flip the toggle on their
> AssetType only for new instances going forward.

Switch to proper EF Core migrations before going to production with real data —
that path applies schema diffs incrementally and doesn't need this dance at all.

### Switching on EF Core migrations

The infrastructure is in place — `AppDbContextFactory.cs` is the design-time
factory the EF tools need, and `Program.cs` already calls `MigrateAsync()` in any
non-Development environment (`ASPNETCORE_ENVIRONMENT=Staging` or `Production`).
All that's missing is the migration files themselves. To generate them:

```bash
# One-time, on a developer machine with the .NET 9 SDK installed:
dotnet tool install --global dotnet-ef           # if not already installed
cd api
dotnet ef migrations add InitialCreate -o Migrations
# Commit the Migrations/ folder.
```

After that, every schema change is:

```bash
cd api
dotnet ef migrations add <DescriptiveName>
# Commit, deploy. `MigrateAsync()` will apply it on next API startup.
```

If you already have a database that was created by `EnsureCreatedAsync` (which
skips the `__EFMigrationsHistory` table), you need to baseline it once before
switching to migrations — either drop and recreate the database, or follow EF's
[existing-database baseline guide](https://learn.microsoft.com/ef/core/managing-schemas/migrations/projects#existing-database).

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
