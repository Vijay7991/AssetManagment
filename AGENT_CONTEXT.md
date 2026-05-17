# AssetHub — handoff context

Paste this whole block into a fresh AI conversation to bring it up to speed.

---

I'm working on **AssetHub**, a self-hosted multi-tenant asset management
platform. Codebase lives at `D:\Projects\Asset Managment` on Windows.

**Stack** (all in Docker, `docker-compose.yml`):
- `api/` — .NET 9 minimal-API, EF Core 9 + Npgsql, BCrypt, MailKit, QRCoder
- `web/` — Next.js 15 (App Router) + React 18 + Tailwind + shadcn/ui +
  TanStack Query + ZXing for QR scanning
- `mobile/` — React Native / Expo, shares DTOs with web via `shared/dto.ts`
- `db` — PostgreSQL 16
- `caddy` — HTTPS reverse-proxy with internal CA (needed for camera on phones)
- `mail` — MailHog SMTP catcher (`http://localhost:8025`)

**Folder layout**
```
api/
  Domain/Entities.cs         — all EF entities in one file
  Infrastructure/            — DbContext, JWT, current-user, mail, audit, perms
  Features/<Domain>/         — one folder per feature group: Auth, Assets,
                               AssetUnits, Tenants, RootAdmin, Catalog,
                               Movements, Tags, Files, Maintenance,
                               Notifications, Imports, Locations, Audit
  Program.cs                 — DI, auth, CORS, EnsureCreatedAsync, route map
web/src/
  app/                       — App Router pages + per-route layouts
  components/ui/             — shadcn primitives (button, card, input, select)
  components/app-shell.tsx   — sidebar + tenant switcher + nav
  lib/api.ts                 — fetch wrapper with token-refresh on 401
  lib/auth-context.tsx       — React context for the JWT session
shared/dto.ts                — canonical DTO types, used by web + mobile
scripts/                     — backup, restore, safe-rebuild, migrate (sh + ps1)
caddy/Caddyfile              — HTTPS termination + /api → api:8080 routing
```

**Conventions**
- Multi-tenant: every entity has `TenantId`. Every query scopes by
  `cu.TenantId` (`ICurrentUser`). Cross-tenant access is via the root-admin
  endpoint group only.
- Roles: per-tenant `Admin` / `Manager` / `Member` + a platform-level
  `IsRootAdmin` flag on `User`. Root admin is bootstrapped from
  `ROOT_ADMIN_EMAIL` env var (set in `.env`).
- Permissions: `Perms.*` constants, role defaults plus per-membership extras
  stored as JSONB. Check via `cu.Can("assets:write")`.
- DTOs are records returned by `TypedResults.Ok/BadRequest/NotFound/Forbid`.
- All custom-field data is JSONB. Schemas live on `AssetType.FieldSchema`,
  values on `Asset.FieldValues` / `AssetUnit.FieldValues`.
- Tags (QR codes) are 10-char base32, unique per tenant. Tags can be
  asset-scoped (`AssetTag.UnitId == null`) or unit-scoped.
- Comments explain *why*, not *what*. No JSDoc-style headers on every method.

**Built features**
- Email/password signup with auto-created tenant + welcome email
- JWT access + rotating refresh tokens
- Asset CRUD + photos + barcodes + browser QR scanner
- Categories, types with custom-field schemas, locations
- Check-in / check-out / move with full movement history
- **Per-unit tracking** (the big recent one): set `AssetType.TrackByUnit` and
  each physical instance becomes an `AssetUnit` with its own barcode, IMEI/
  serial, warranty, status, assignee, and movement history. Partial checkout
  (1 of 10) works via batch endpoints + a multi-select modal with scan-to-add.
- Accounts: tenant admins can activate/deactivate members and trigger password
  resets. Root admins do the same across all workspaces from `/admin`.
- Self-service password reset via email link (1h, single-use, revokes all
  refresh tokens on consume).
- Member invites by Email or WhatsApp. Restrictions: no duplicate emails, no
  re-inviting existing members, root admin email is reserved.
- `/api/health/mail` SMTP probe; UI hides the Email invite tab when SMTP is
  down and forces WhatsApp.
- Maintenance tickets, audit log, in-app notifications + email copy.
- CSV import/export.
- Backup / restore / safe-rebuild / migrate scripts in `scripts/`.

**Database evolution pattern (important!)**
The API uses `EnsureCreatedAsync` — does NOTHING when tables already exist.
For each new entity/column release we ship a hand-written, idempotent SQL
migration as `scripts/migrate-YYYY-MM-<topic>.sql`, applied via
`scripts/migrate.ps1` (or `migrate.sh`). The wrapper auto-backs-up first.
DON'T add columns silently — without a migration, existing installs 500 on
queries that touch the new column.

**Day-to-day workflow**
```powershell
# Edit code, then:
docker compose up -d --build         # data preserved, code refreshed
.\scripts\migrate.ps1                # only if you added columns/tables
# Browser: Ctrl+Shift+R for the first reload after a web rebuild
```

For destructive resets: `.\scripts\safe-rebuild.ps1` (auto-backs-up first).

**When I ask you to add a feature, please:**
1. Read the relevant `Features/<Domain>/*.cs` and `web/src/app/<route>/page.tsx`
   files before designing — the patterns are consistent and worth matching.
2. Schema changes → update `Domain/Entities.cs`, wire `Infrastructure/AppDbContext.cs`,
   AND write a new `scripts/migrate-YYYY-MM-<topic>.sql` for existing installs.
3. New types go in `shared/dto.ts` first, then re-export from `web/src/lib/api.ts`.
4. Confirm tenant scoping on every new query. Use `cu.Can(Perms.X)` for
   permission checks, return `Forbid()` not `Unauthorized()` for those.
5. Verify build claim with the actual file diffs — don't rely on memory of
   what should be there.

What I'd like you to do is: <YOUR REQUEST HERE>
