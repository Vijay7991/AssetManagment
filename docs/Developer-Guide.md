# AssetHub — Developer Guide

> **Audience:** Engineers building, extending, or maintaining AssetHub.  
> **Stack:** Next.js 14 (App Router) · ASP.NET Core 9 · PostgreSQL 16 · Docker Compose

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Layout](#2-repository-layout)
3. [Local Development Setup](#3-local-development-setup)
4. [Authentication Flow](#4-authentication-flow)
5. [Role-Based Access Control](#5-role-based-access-control)
6. [API Conventions](#6-api-conventions)
7. [Frontend Patterns](#7-frontend-patterns)
8. [Database & Migrations](#8-database--migrations)
9. [Adding a New Feature](#9-adding-a-new-feature)
10. [Testing](#10-testing)
11. [Docker & Deployment](#11-docker--deployment)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Mobile                          │
│                    Next.js 14 App Router (port 3000)             │
│   React Query · Tailwind CSS · shadcn/ui · next-themes           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/REST (JSON)
                           │ Authorization: Bearer <JWT>
┌──────────────────────────▼──────────────────────────────────────┐
│                    ASP.NET Core 9 API (port 5000)                │
│   Minimal API · EF Core 9 · Npgsql · BCrypt · MailKit            │
│   Multi-tenant middleware · Permission resolvers                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ EF Core + Npgsql
┌──────────────────────────▼──────────────────────────────────────┐
│                     PostgreSQL 16 (port 5432)                    │
│   JSONB columns · UUID PKs · Soft delete on Assets               │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- **Single PostgreSQL database** — all tenants share one DB, isolated by `TenantId` column
- **JWT tokens** — issued by the API on login; access token (15 min) + refresh token (30 days)
- **No external IdP required** — passwords hashed with BCrypt; optional SMTP for invites/reset
- **JSONB for extensibility** — `FieldSchema`, `FieldValues`, `ExtraPermissions` avoid schema churn

---

## 2. Repository Layout

```
AssetManagment/
├── api/                          # ASP.NET Core 9 backend
│   ├── Features/                 # Vertical-slice feature folders
│   │   ├── Assets/               #   AssetEndpoints.cs, AssetDto.cs …
│   │   ├── Auth/                 #   AuthEndpoints.cs
│   │   ├── Categories/
│   │   ├── AssetTypes/
│   │   ├── Locations/
│   │   ├── Maintenance/
│   │   ├── Members/
│   │   ├── Notifications/
│   │   └── Admin/
│   ├── Models/                   # EF Core entities (Asset.cs, Tenant.cs …)
│   ├── Data/                     # AppDbContext.cs, Migrations/
│   ├── Middleware/               # TenantMiddleware, ErrorHandling
│   ├── Services/                 # MailService, TokenService …
│   └── Program.cs                # DI, middleware pipeline, route registration
│
├── web/                          # Next.js 14 frontend
│   ├── src/
│   │   ├── app/                  # App Router pages
│   │   │   ├── dashboard/
│   │   │   ├── assets/
│   │   │   ├── maintenance/
│   │   │   ├── members/
│   │   │   ├── categories/
│   │   │   ├── asset-types/
│   │   │   ├── locations/
│   │   │   ├── scan/
│   │   │   ├── activity/
│   │   │   ├── settings/
│   │   │   └── admin/
│   │   ├── components/
│   │   │   ├── app-shell.tsx     # Sidebar, topbar, nav
│   │   │   └── ui/              # shadcn/ui components
│   │   └── lib/
│   │       ├── api.ts            # Typed fetch wrapper + DTO types
│   │       ├── auth-context.tsx  # AuthProvider, useAuth, useCan
│   │       └── utils.ts          # cn(), relativeTime()
│   ├── next.config.ts
│   └── package.json
│
├── docs/                         # Documentation
│   ├── Database-Schema.md
│   ├── Developer-Guide.md        # ← this file
│   └── …
├── docker-compose.yml
└── docker-compose.prod.yml
```

---

## 3. Local Development Setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker Desktop | 24+ | Includes Compose v2 |
| Node.js | 20 LTS | For running web outside Docker |
| .NET SDK | 9.0 | For running API outside Docker |
| PostgreSQL client | Any | psql / DBeaver / TablePlus |

### Quick start (Docker — recommended)

```bash
git clone <repo-url>
cd AssetManagment

# Copy environment files
cp api/.env.example api/.env
cp web/.env.example web/.env.local

# Start everything
docker compose up --build
```

Services start at:
- Web UI → http://localhost:3000
- API → http://localhost:5000
- PostgreSQL → localhost:5432 (user: `assethub`, db: `assethub`)

### Running services individually (faster iteration)

**API:**
```bash
cd api
dotnet watch run
# API at https://localhost:5001 (HTTPS) or http://localhost:5000
```

**Web:**
```bash
cd web
npm install
npm run dev
# UI at http://localhost:3000
```

### Environment Variables

**`api/.env`**

```env
ConnectionStrings__Default=Host=localhost;Port=5432;Database=assethub;Username=assethub;Password=secret
Jwt__Secret=your-32-char-minimum-secret-key-here
Jwt__Issuer=assethub-api
Jwt__Audience=assethub-web
Jwt__AccessTokenMinutes=15
Jwt__RefreshTokenDays=30
Mail__Host=smtp.example.com
Mail__Port=587
Mail__User=noreply@example.com
Mail__Password=mailpassword
Mail__From=AssetHub <noreply@example.com>
RootAdmin__Email=root@example.com
RootAdmin__Password=ChangeMe123!
```

**`web/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 4. Authentication Flow

```
Client                           API
  │                               │
  │  POST /auth/login             │
  │  { email, password }          │
  │──────────────────────────────►│
  │                               │ Verify BCrypt hash
  │                               │ Build JWT with perms claim
  │◄──────────────────────────────│
  │  { accessToken, refreshToken, │
  │    user, tenants }            │
  │                               │
  │  (store in memory / cookie)   │
  │                               │
  │  GET /assets                  │
  │  Authorization: Bearer <JWT>  │
  │──────────────────────────────►│
  │                               │ Validate JWT signature
  │                               │ Extract TenantId from header/claim
  │                               │ Resolve permissions
  │◄──────────────────────────────│
  │  200 OK [ ...assets ]         │
```

### JWT payload structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "Jane Smith",
  "tid": "tenant-uuid",
  "role": "Admin",
  "perms": ["assets:write", "catalog:write", "members:write"],
  "isRoot": false,
  "exp": 1700000000
}
```

### Token refresh

```
POST /auth/refresh
{ "refreshToken": "<opaque-token>" }
→ { "accessToken": "<new-jwt>", "refreshToken": "<new-opaque>" }
```

The frontend `AuthProvider` (`web/src/lib/auth-context.tsx`) automatically refreshes before expiry using a `setTimeout`.

### Tenant switching

A user can belong to multiple tenants. The active tenant is tracked in auth context. Switching calls:

```
POST /auth/switch-tenant
{ "tenantId": "<target-tenant-id>" }
→ { "accessToken": "<new-jwt-for-that-tenant>", ... }
```

---

## 5. Role-Based Access Control

### Roles (per tenant membership)

| Role | Description |
|------|-------------|
| `Admin` | Full access to everything in the tenant |
| `Manager` | Full asset + maintenance access; can't manage members or catalog |
| `Member` | Read assets, check out/in, view maintenance |

### Permissions (granular, stored as JSONB array on `TenantUser`)

| Permission | Grants |
|------------|--------|
| `assets:write` | Create, edit, delete assets |
| `assets:checkout` | Check out / check in assets |
| `catalog:write` | Manage categories, asset types, locations |
| `maintenance:write` | Create / update maintenance tickets |
| `import:write` | Bulk CSV import |
| `members:write` | Invite / remove members, change roles |

**How permissions are resolved (API side):**

```csharp
// TenantContext.cs
var rolePerms = role switch {
    "Admin"   => AllPermissions,
    "Manager" => new[] { "assets:write", "assets:checkout", "maintenance:write", "import:write" },
    "Member"  => new[] { "assets:checkout" },
    _         => Array.Empty<string>()
};
var extra = tenantUser.ExtraPermissions ?? [];
CurrentUser.Permissions = rolePerms.Union(extra).ToHashSet();
```

**API enforcement:**

```csharp
app.MapPost("/assets", CreateAsset)
   .RequirePermission("assets:write");
```

**Frontend enforcement:**

```tsx
// In any component:
const canWrite = useCan("assets:write");

// In app-shell nav:
NAV.filter(item => {
  if (item.permission && !activeTenant?.permissions?.includes(item.permission)) return false;
  return true;
})
```

> **Important:** Frontend checks are UI-only. Never rely on them for security — the API always re-validates.

---

## 6. API Conventions

### Base URL

```
http://localhost:5000   (dev)
https://api.yourdomain.com  (prod)
```

All routes are prefixed automatically by feature. No versioning prefix (v1, etc.) currently.

### Request / Response format

- Content-Type: `application/json`
- Auth: `Authorization: Bearer <access-token>`
- Tenant: resolved from JWT `tid` claim; no header needed

### Pagination

```
GET /assets?page=1&pageSize=20
→ { items: [...], total: 142, page: 1, pageSize: 20 }
```

### Filtering

Query params vary by endpoint. Common ones:

```
GET /assets?q=laptop&status=InService&locationId=<uuid>&warrantyExpiring=true&page=2
```

### Error responses

```json
{
  "error": "Not found",
  "detail": "Asset with id abc123 does not exist."
}
```

| HTTP Status | Meaning |
|-------------|---------|
| 200 | OK |
| 201 | Created |
| 204 | Deleted / No content |
| 400 | Validation error |
| 401 | Missing / invalid token |
| 403 | Valid token but insufficient permission |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate name) |
| 500 | Unexpected server error |

### Key endpoints reference

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/auth/login` | — | Email/password login |
| POST | `/auth/refresh` | — | Refresh access token |
| POST | `/auth/switch-tenant` | — | Get token for another tenant |
| GET | `/assets` | — | List assets (paginated + filtered) |
| POST | `/assets` | `assets:write` | Create asset |
| GET | `/assets/:id` | — | Get asset detail |
| PUT | `/assets/:id` | `assets:write` | Update asset |
| DELETE | `/assets/:id` | `assets:write` | Soft-delete asset |
| POST | `/assets/:id/checkout` | `assets:checkout` | Check out asset |
| POST | `/assets/:id/checkin` | `assets:checkout` | Check in asset |
| GET | `/categories` | — | List categories |
| POST | `/categories` | `catalog:write` | Create category |
| GET | `/asset-types` | `catalog:write` | List asset types |
| POST | `/asset-types` | `catalog:write` | Create asset type |
| GET | `/locations` | — | List locations |
| POST | `/locations` | `catalog:write` | Create location |
| GET | `/maintenance` | — | List tickets |
| POST | `/maintenance` | `maintenance:write` | Create ticket |
| GET | `/members` | `members:write` | List tenant members |
| POST | `/members/invite` | `members:write` | Invite member |
| GET | `/dashboard/stats` | — | KPI counts |
| GET | `/notifications` | — | User notifications |
| POST | `/notifications/read-all` | — | Mark all read |
| GET | `/activity` | — | Audit log |

---

## 7. Frontend Patterns

### Data fetching with React Query

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ["assets", q, status, page],   // include ALL filter params
  queryFn: () => api.get<AssetPage>(`/assets?${params}`, accessToken),
  enabled: !!accessToken,
  staleTime: 30_000,
});
```

Always include filter state in `queryKey` so React Query re-fetches when filters change.

### Mutations

```tsx
const create = useMutation({
  mutationFn: (body: CreateAssetDto) => api.post<Asset>("/assets", body, accessToken),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["assets"] });
    // reset form, close modal, etc.
  },
  onError: (e: any) => setErr(e?.message || "Failed."),
});
```

### The `api` helper (`web/src/lib/api.ts`)

```ts
api.get<T>(path, token)              // GET → T
api.post<T>(path, body, token)       // POST → T
api.put<T>(path, body, token)        // PUT → T
api.del<T>(path, token)              // DELETE → T
```

All methods throw on non-2xx responses with `error.message` set to the server's `error` field.

### Permission checks (React)

```tsx
import { useCan } from "@/lib/auth-context";

function MyPage() {
  const canWrite = useCan("assets:write");

  return canWrite ? <EditButton /> : null;
}
```

### Rules of Hooks — IMPORTANT

All hooks must be called **before** any conditional return:

```tsx
// ✅ CORRECT
export default function Page() {
  const canWrite = useCan("catalog:write");
  const [form, setForm] = useState({ name: "" });
  const data = useQuery({ ... });

  if (!canWrite) return <AccessDenied />;  // guard AFTER all hooks
  return <FullUI />;
}

// ❌ WRONG — causes build error
export default function Page() {
  if (!someCondition) return <Early />;   // early return BEFORE hooks
  const [form, setForm] = useState({});   // hook called conditionally
}
```

### `useSearchParams()` in App Router

Requires a Suspense boundary — wrap the real component:

```tsx
// page.tsx
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <PageContent />
    </Suspense>
  );
}

function PageContent() {
  const searchParams = useSearchParams();  // safe here
  const status = searchParams.get("status") || "";
  // ...
}
```

---

## 8. Database & Migrations

### EF Core migrations

```bash
cd api

# Create a new migration after changing entities
dotnet ef migrations add <MigrationName>

# Apply migrations to DB
dotnet ef database update

# Roll back one migration
dotnet ef database update <PreviousMigrationName>
```

> Migrations run **automatically** on API startup in development (`AppDbContext.Database.MigrateAsync()` in `Program.cs`).

### Adding a new column

1. Edit the entity in `Models/`
2. Run `dotnet ef migrations add AddMyColumn`
3. Review the generated migration file
4. Run `dotnet ef database update` or restart the API

### JSONB columns

```csharp
// Entity
public string[]? ExtraPermissions { get; set; }

// EF Core config (OnModelCreating)
builder.Entity<TenantUser>()
    .Property(e => e.ExtraPermissions)
    .HasColumnType("jsonb");
```

Read the [Database Schema doc](./Database-Schema.md) for full column details.

---

## 9. Adding a New Feature

### Example: Add a "Vendors" module

**Step 1 — API: Define the entity**

```csharp
// Models/Vendor.cs
public class Vendor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public string Name { get; set; } = "";
    public string? ContactEmail { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

**Step 2 — API: Add to DbContext**

```csharp
// Data/AppDbContext.cs
public DbSet<Vendor> Vendors => Set<Vendor>();
```

**Step 3 — API: Create migration**

```bash
dotnet ef migrations add AddVendors
dotnet ef database update
```

**Step 4 — API: Create endpoints**

```csharp
// Features/Vendors/VendorEndpoints.cs
public static class VendorEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/vendors", List);
        app.MapPost("/vendors", Create).RequirePermission("catalog:write");
        app.MapDelete("/vendors/{id}", Delete).RequirePermission("catalog:write");
    }

    static async Task<IResult> List(AppDbContext db, ICurrentUser user)
    {
        var vendors = await db.Vendors
            .Where(v => v.TenantId == user.TenantId)
            .OrderBy(v => v.Name)
            .ToListAsync();
        return Results.Ok(vendors);
    }

    static async Task<IResult> Create(VendorDto dto, AppDbContext db, ICurrentUser user)
    {
        var vendor = new Vendor { TenantId = user.TenantId, Name = dto.Name, ContactEmail = dto.ContactEmail };
        db.Vendors.Add(vendor);
        await db.SaveChangesAsync();
        return Results.Created($"/vendors/{vendor.Id}", vendor);
    }

    static async Task<IResult> Delete(Guid id, AppDbContext db, ICurrentUser user)
    {
        var vendor = await db.Vendors.FirstOrDefaultAsync(v => v.Id == id && v.TenantId == user.TenantId);
        if (vendor is null) return Results.NotFound();
        db.Vendors.Remove(vendor);
        await db.SaveChangesAsync();
        return Results.NoContent();
    }
}
```

**Step 5 — API: Register endpoints**

```csharp
// Program.cs
VendorEndpoints.Map(app);
```

**Step 6 — Frontend: Add API type**

```ts
// web/src/lib/api.ts
export interface Vendor {
  id: string;
  tenantId: string;
  name: string;
  contactEmail?: string;
  createdAt: string;
}
```

**Step 7 — Frontend: Create page**

```
web/src/app/vendors/page.tsx
```

Follow the same pattern as `categories/page.tsx` — `useCan`, hooks before guards, React Query.

**Step 8 — Frontend: Add to nav**

```tsx
// app-shell.tsx
{ label: "Vendors", href: "/vendors", icon: Building2, permission: "catalog:write" },
```

---

## 10. Testing

### API tests

```bash
cd api
dotnet test
```

Tests use an in-memory SQLite DB (or test PostgreSQL container) via `WebApplicationFactory`.

### Frontend linting & type-check

```bash
cd web
npm run lint       # ESLint
npm run type-check # tsc --noEmit
```

### Manual API testing

Use the included Bruno collection (or Postman/Insomnia). Auth flow:

```
POST /auth/login → copy accessToken → use as Bearer in subsequent requests
```

---

## 11. Docker & Deployment

### Development

```bash
docker compose up --build
```

### Production build

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

The production compose file:
- Uses multi-stage Docker builds (smaller images)
- Mounts a named volume for PostgreSQL data
- Sets `NODE_ENV=production` and `ASPNETCORE_ENVIRONMENT=Production`
- Does NOT expose PostgreSQL port externally

### Environment variables in production

Set these via your hosting platform's secret management (Render, Railway, Fly.io, ECS, etc.):

```
ConnectionStrings__Default=Host=...
Jwt__Secret=<32+ random chars>
Mail__Host=...
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### Health check

```
GET /health
→ 200 OK  { "status": "healthy" }
```

---

## 12. Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Hook after conditional return | `Invalid hook call` build error | Move ALL hooks above any `if () return` |
| Missing `enabled` on queries | Fetches without token, 401 loop | Add `enabled: !!accessToken` |
| Wrong query key | Stale data after filter change | Include all filter variables in `queryKey` array |
| `useSearchParams` without Suspense | Hydration error in Next.js | Wrap page in `<Suspense>` |
| Forgetting `TenantId` filter | Cross-tenant data leakage | Every DB query must `.Where(x => x.TenantId == user.TenantId)` |
| Soft delete not respected | Deleted assets appear in lists | Assets: always add `.Where(a => a.DeletedAt == null)` |
| Migrations not applied | `relation does not exist` error | Run `dotnet ef database update` or restart API |
| JSONB column null | NullReferenceException | Use `?? []` / `?? Array.Empty<string>()` |

---

*Last updated: May 2026*
