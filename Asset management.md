# AssetHub — Project Summary

A condensed record of everything that was designed, built, and decided across this project. Use it as a quick-reference index; deeper detail lives in `docs/` and in the code.

---

## What AssetHub is

A self-hosted, multi-tenant asset management platform. Tracks physical things — laptops, vehicles, machines, tools, office equipment — across multiple locations, with QR-code labels, check-in/check-out, maintenance tickets, an audit log, notifications, CSV import/export, and member management with granular permissions. Free for individuals, designed to deploy on any commodity Linux box (including a free Oracle Cloud VM) without paid services.

**Stack.** .NET 9 modular monolith API + PostgreSQL 16 + Next.js 15 web frontend + React Native (Expo SDK 54) mobile app + Caddy reverse proxy with internal CA for LAN HTTPS. Everything packaged as Docker Compose.

---

## The journey, condensed

The conversation moved through three big phases:

1. **Design** — a senior-architect-style brief for a Maximo-class platform, scoped down with deliberate pushback on bad calls (DB-per-tenant from day one, trying to be all things to all ICPs, etc.).
2. **MVP build** — went from architecture to running code with `docker compose up`, then layered Phase 2 operational features (audit, maintenance, notifications, CSV) and Phase 3 polish (permissions, locations, mobile).
3. **Documentation and mobile** — four Word documents covering Developer Guide, Database Schema, User Manual, Business Overview; a React Native + Expo mobile app for Android (and iOS) that talks to the same backend.

---

## Architecture in one diagram

```
[ Phone / Browser ]
        │ HTTPS :443
        ▼
   [ Caddy ]
       ├── /api/*   ──►  [ .NET 9 API :8080 ] ──► [ PostgreSQL 16 ]
       │                         │
       │                         ├──► [ MailHog SMTP :1025 ] (dev)
       │                         └──► [ Local uploads volume ]
       └── everything else ──►  [ Next.js 15 web :3000 ]
```

Five Docker containers, one network, persistent volumes for DB and uploads. Same Compose file works for local dev and a single-VM cloud deployment — only the `.env` differs.

---

## Repository layout

```
D:\Projects\Asset Managment\
├── README.md
├── Asset management.md          ← this file
├── docker-compose.yml
├── .env.example
├── .gitignore
├── caddy/Caddyfile
├── api/                         # .NET 9 backend
│   ├── Dockerfile
│   ├── Program.cs               # DI wiring, middleware, endpoint mapping
│   ├── Domain/Entities.cs       # All EF Core entities
│   ├── Infrastructure/          # DbContext, JWT, permissions, audit, etc.
│   └── Features/                # One folder per bounded context
│       ├── Auth, Tenants, Catalog, Locations, Assets, Tags,
│       ├── Files, Movements, Maintenance, Notifications, Audit, Imports
├── web/                         # Next.js 15 frontend
│   └── src/
│       ├── app/                 # App Router pages
│       ├── components/          # UI primitives + AppShell
│       └── lib/                 # API client, auth, utils
├── mobile/                      # React Native + Expo SDK 54
│   ├── app/                     # Expo Router routes (auth, tabs, asset detail)
│   └── src/                     # lib + components
└── docs/                        # Word documentation (4 files)
    ├── AssetHub-Developer-Guide.docx
    ├── AssetHub-Database-Schema.docx
    ├── AssetHub-User-Manual.docx
    └── AssetHub-Business-Overview.docx
```

---

## Features built

### Core (Phase 1 MVP)

- Email + password signup with auto-created workspace; first user becomes immutable Owner
- Multi-tenant via shared DB + `tenant_id` column on every business table
- Asset CRUD with custom-field schema per asset type (JSONB)
- Photo upload, served from a local Docker volume
- Auto-generated QR codes per asset; printable label view
- Browser-based QR scanner (works on phone over LAN HTTPS via Caddy internal CA)
- Asset categories (tree) and asset types (templates with custom field schema)
- Light/dark theme, responsive, PWA-installable

### Phase 2 operational features

- **Audit log** — append-only, every meaningful write captured, paginated activity feed at `/activity`
- **Asset assignment** — check-in / check-out / move workflow with full per-asset movement history
- **Maintenance tickets** — preventive, corrective, inspection; with priority, assignee, scheduling, cost; status transitions audited
- **Notifications** — in-app bell with unread badge + email copy; assignment notifications + warranty-expiring background scan (30/14/7/1-day thresholds)
- **CSV import / export** — auto-creates missing categories, types, and locations on import
- **Asset edit** — full edit form mirroring the create flow

### Phase 3 polish

- **Granular permissions** — Admin/Manager/Member roles with a per-member `ExtraPermissions` JSONB override. Six canonical permissions (`assets:write`, `assets:checkout`, `catalog:write`, `maintenance:write`, `import:write`, `members:write`). Frontend gates UI by `useCan()`.
- **Owner / last-admin protection** — first signup is permanent Owner; cannot remove yourself; cannot demote or remove the last Admin
- **Locations** — managed places (warehouses, offices, sites) with city, region, country, code, asset count; quick-filter pill strip on the assets page; asset has both `LocationId` (FK to managed Location) and `LocationDetail` (free-form spot within)
- **WhatsApp invitations** — alongside email; uses `wa.me` URL scheme, no paid SMS API needed; auto-opens WhatsApp with a pre-filled invite message
- **Warranty notifications** — `BackgroundService` runs every 6 hours, dedupes per (asset, threshold)

### Mobile app (Expo SDK 54)

- Same backend, no separate server
- First-launch server-URL setup screen with health-probe validation; persists to `expo-secure-store`
- Auth: login + signup with token storage in SecureStore
- Bottom-tab navigation: **Scan**, **Assets**, **Profile**
- QR scanner using `expo-camera` with debounced duplicate prevention + manual code entry
- Asset list with search, pull-to-refresh, status badges
- Asset detail with photos, custom fields, history, QR display, and check-in/out/move actions (modal)
- Profile screen with workspace switching, owner badge, sign-out, and "change server" flow

---

## Documentation produced

Four Word documents in `docs/`:

| File | Purpose | Size |
|---|---|---|
| `AssetHub-Developer-Guide.docx` | 16-section architecture and contribution guide | ~46 KB |
| `AssetHub-Database-Schema.docx` | Every table, column, index, plus sample queries | ~44 KB |
| `AssetHub-User-Manual.docx` | Step-numbered end-user walkthrough | ~44 KB |
| `AssetHub-Business-Overview.docx` | Vision, ICP, pricing, roadmap, risk register | ~43 KB |

Generated from a Python script using `python-docx`. Re-runnable; bake in your branding by editing the cover function.

---

## Quick-run

```powershell
cd "D:\Projects\Asset Managment"

# 1. Copy env, generate a JWT secret
copy .env.example .env
$secret = [Convert]::ToBase64String((1..48 | %{Get-Random -Max 256}))
(Get-Content .env) -replace 'JWT_SECRET=.*', "JWT_SECRET=$secret" | Set-Content .env

# 2. Boot the backend + frontend stack
docker compose up -d --build
docker compose logs -f api   # wait for "Database schema verified."

# 3. Open the web app
Start-Process https://localhost

# 4. Run the mobile app (Expo SDK 54)
cd mobile
npm install
npx expo install --fix
npx expo start -c
# Scan the QR with Expo Go on your phone
```

---

## Key architectural decisions

1. **Shared DB, not DB-per-tenant.** Cheaper to operate, easier to migrate. Dedicated DB sold as an Enterprise SKU later.
2. **Modular monolith over microservices.** One deployable, one CI/CD, atomic transactions across modules. Extract services only when scaling pressure demands it.
3. **JWT auth with rotating refresh tokens hashed in DB.** Short access TTL (60 min), long refresh TTL (30 days). Claim mapping disabled on both ends to prevent the `tid` collision that originally hid tenant data.
4. **Tag = separate aggregate from Asset.** One asset can have multiple QR codes (re-tagging, damaged labels). Short opaque 10-char Crockford base32 code, not the asset UUID.
5. **Custom fields as JSONB.** AssetType defines a schema array; Asset stores values as a JSONB document. Flexible without painting yourself into a corner.
6. **Permissions = role defaults + per-member extras.** Encoded into JWT `perms` claim at issue. Members are read-only by default; Admins grant specific capabilities without role promotion.
7. **Local file storage, not S3.** Cheap, runs anywhere, swap to Azure Blob / R2 when usage warrants.
8. **HTTPS for LAN via Caddy `tls internal`.** Lets camera-based scanning work on phones over local Wi-Fi without a public domain.
9. **EnsureCreated in dev, migrations in prod.** Documented switch when going live.
10. **Web first, native mobile second.** Web PWA already runs the camera scanner; native app added later for better field UX.

---

## Bugs we hit and fixed (worth knowing about)

| Bug | Cause | Fix |
|---|---|---|
| `error CS1503: argument 3: method group → RequestDelegate` | Named a static endpoint method `GetType`, which collides with `Object.GetType()` | Renamed to `GetAssetType` |
| `lastCodeRef.current is possibly null` TS error in scan page | Optional chain didn't narrow across `&&` boundary | Hoisted to a local variable first |
| `ERR_SSL_PROTOCOL_ERROR` on `https://localhost` | Caddy with port-only block + `tls internal` doesn't know what hostname to issue for | Switched to explicit hostname blocks + on-demand TLS for LAN IPs |
| Asset Types / Categories returning `[]` despite data in DB | `JsonWebTokenHandler` claim-name mapping mangled `tid` claim silently | Disabled `MapInboundClaims` everywhere; added `tenant_id` alongside `tid` |
| `current.location` TS error after location rename | Renamed `Asset.Location` from `string?` to nav property; missed two callers | Switched stale references to `LocationDetail` |
| `_ExpoFontLoader.default.getLoadedFonts is not a function` | SDK 51 project bundle on SDK 54 Expo Go runtime | Bumped project to SDK 54, wiped `node_modules`, restarted Metro with `-c` |

---

## What's deliberately not built (next phases)

- Departments / sub-tenants below workspace
- Reports & analytics charts (chart library deferred until data shape stabilizes)
- Excel (XLSX) import beyond CSV
- Native offline-first mobile sync (WatermelonDB)
- RFID / NFC integration
- AI predictive maintenance, OCR document scanning
- SSO / SAML / SCIM (Enterprise tier)
- Dedicated DB-per-tenant SKU (Phase 3+)
- Bulk-print QR sheets (Avery label templates)
- Push notifications on the mobile app

---

## Production hardening checklist (before going public)

- [ ] Replace `JWT_SECRET` with a real 32+ char random value
- [ ] Replace `POSTGRES_PASSWORD`
- [ ] Set `ASPNETCORE_ENVIRONMENT=Production` (disables OpenAPI exposure)
- [ ] Replace MailHog with a real SMTP (Brevo, Resend, Mailgun free tiers)
- [ ] Switch `caddy/Caddyfile` from `tls internal` to a real hostname block — Caddy auto-fetches Let's Encrypt
- [ ] Daily `pg_dump` + off-host backup
- [ ] Update `Cors:AllowedOrigins` to your real public domain
- [ ] Move from `EnsureCreated` to EF Core Migrations
- [ ] Add Postgres Row-Level Security for defense-in-depth tenant isolation
- [ ] Enable Sentry / proper logging sink

---

## Deployment options (ranked by effort, all free)

1. **Oracle Cloud Always Free ARM VM** — 4 vCPU / 24 GB RAM forever free; the existing Docker Compose runs unchanged. Best long-term answer.
2. **Cloudflare Tunnel** — keep your machine as host, expose securely via Cloudflare. Zero firewall config, free.
3. **Fly.io free allowance** — split Compose into three Fly apps. Requires a little refactoring.
4. **Local network only** — pilot mode. Free, easy, no public exposure.

Detailed setup for each lives in `docs/AssetHub-Developer-Guide.docx`.

---

## Final inventory

| Area | Files | Tech |
|---|---|---|
| API | ~25 .cs | .NET 9, EF Core 9, Npgsql, BCrypt, QRCoder, MailKit |
| Web | ~30 .tsx + ~10 supporting | Next.js 15, React 19, Tailwind, TanStack Query, ZXing |
| Mobile | 16 .tsx + 4 config | Expo SDK 54, React Native 0.81, Expo Router 6, expo-camera, expo-secure-store |
| Infra | 4 (compose, env, Caddyfile, Dockerfiles) | Docker, Caddy, Postgres |
| Docs | 4 .docx | Generated via python-docx |

---

*Last updated at the end of the building session. Treat this as the canonical index; for any detail not here, see `docs/` or the relevant module README.*
