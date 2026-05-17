# AssetHub — Developer Cheat Sheet

> Quick-reference for common commands, patterns, and lookups.

---

## CLI Commands

### Docker

```bash
docker compose up --build          # Start all services (rebuild images)
docker compose up -d               # Start in background
docker compose down                # Stop all services
docker compose down -v             # Stop + delete volumes (WARNING: clears DB)
docker compose logs -f api         # Tail API logs
docker compose logs -f web         # Tail web logs
docker compose ps                  # Show running containers
```

### .NET API

```bash
cd api
dotnet run                         # Start API
dotnet watch run                   # Start API with hot-reload
dotnet build                       # Build only
dotnet test                        # Run tests

# EF Core Migrations
dotnet ef migrations add <Name>    # Create new migration
dotnet ef database update          # Apply pending migrations
dotnet ef migrations list          # List all migrations
dotnet ef migrations remove        # Remove last migration (if not applied)
```

### Next.js Web

```bash
cd web
npm run dev                        # Dev server (localhost:3000)
npm run build                      # Production build
npm run start                      # Start production server
npm run lint                       # ESLint
npx tsc --noEmit                   # Type-check only
```

---

## API Endpoints Quick Reference

### Auth

```
POST   /auth/login              { email, password }
POST   /auth/refresh            { refreshToken }
POST   /auth/logout             {}
POST   /auth/switch-tenant      { tenantId }
POST   /auth/forgot-password    { email }
POST   /auth/reset-password     { token, newPassword }
GET    /auth/me                 → current user + tenant info
```

### Assets

```
GET    /assets                  ?q=&status=&locationId=&warrantyExpiring=&page=&pageSize=
POST   /assets                  { name, assetTypeId, locationId, status, serialNumber, ... }
GET    /assets/:id
PUT    /assets/:id
DELETE /assets/:id              (soft delete)
POST   /assets/:id/checkout     { userId?, notes? }
POST   /assets/:id/checkin      { notes? }
GET    /assets/:id/history      → checkout/checkin log
POST   /assets/import           multipart/form-data (CSV)
```

### Catalog

```
GET    /categories
POST   /categories              { name, parentId?, icon?, color? }
DELETE /categories/:id

GET    /asset-types             (requires catalog:write)
POST   /asset-types             { name, categoryId, fieldSchema[] }
DELETE /asset-types/:id

GET    /locations
POST   /locations               { name, parentId?, address? }
DELETE /locations/:id
```

### Maintenance

```
GET    /maintenance             ?status=&assetId=&page=
POST   /maintenance             { assetId, title, description, priority }
GET    /maintenance/:id
PUT    /maintenance/:id         { status, notes, resolvedAt }
```

### Members

```
GET    /members                 (requires members:write)
POST   /members/invite          { email, role }
DELETE /members/:userId
PUT    /members/:userId/role    { role }
PUT    /members/:userId/perms   { permissions[] }
POST   /members/:userId/reset-password
```

### Dashboard & Misc

```
GET    /dashboard/stats         → { total, inService, inRepair, checkedOut, warrantyExpiring, byStatus[] }
GET    /activity                ?page=
GET    /notifications
POST   /notifications/read-all
GET    /notifications/unread-count
GET    /health
```

---

## Permissions Reference

| Permission | Who has it by default | What it unlocks |
|------------|----------------------|-----------------|
| `assets:write` | Admin, Manager | Create/edit/delete assets, import CSV |
| `assets:checkout` | Admin, Manager, Member | Check out / check in assets |
| `catalog:write` | Admin | Categories, Asset Types, Locations |
| `maintenance:write` | Admin, Manager | Create/update maintenance tickets |
| `import:write` | Admin, Manager | Bulk CSV import |
| `members:write` | Admin | Invite/remove members, change roles |

**Role defaults:**

| Role | Permissions |
|------|-------------|
| Admin | ALL of the above |
| Manager | `assets:write`, `assets:checkout`, `maintenance:write`, `import:write` |
| Member | `assets:checkout` only (+ any granted via ExtraPermissions) |

---

## Status Values

### Asset Status

| Value | Meaning |
|-------|---------|
| `InService` | Active and available |
| `InRepair` | Under maintenance |
| `Retired` | Decommissioned |
| `Lost` | Can't be located |
| `CheckedOut` | Currently assigned to a user |

### Maintenance Priority

| Value | Meaning |
|-------|---------|
| `Low` | Non-urgent |
| `Medium` | Standard priority |
| `High` | Urgent |
| `Critical` | Immediate action required |

### Maintenance Status

| Value | Meaning |
|-------|---------|
| `Open` | Reported, not started |
| `InProgress` | Being worked on |
| `Resolved` | Fixed/completed |
| `Closed` | Archived |

---

## Frontend Patterns

### Adding a new page

```tsx
// web/src/app/my-feature/page.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useCan } from "@/lib/auth-context";
import { api } from "@/lib/api";

export default function MyFeaturePage() {
  // 1. ALL hooks first (before any conditional return)
  const { accessToken } = useAuth();
  const canWrite = useCan("catalog:write");      // permission check
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "" });

  const items = useQuery({
    queryKey: ["my-feature"],
    queryFn: () => api.get("/my-feature", accessToken),
    enabled: !!accessToken,
  });

  const create = useMutation({
    mutationFn: (body) => api.post("/my-feature", body, accessToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-feature"] }),
  });

  // 2. Guards AFTER hooks
  if (!canWrite) return <AccessDenied />;

  // 3. Normal render
  return <div>...</div>;
}
```

### Reading URL params

```tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <PageContent />
    </Suspense>
  );
}

function PageContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "";
  // ...
}
```

### Calling the API

```ts
import { api } from "@/lib/api";
const { accessToken } = useAuth();

// GET
const data = await api.get<MyType>("/endpoint", accessToken);

// POST
const created = await api.post<MyType>("/endpoint", body, accessToken);

// PUT
await api.put<MyType>("/endpoint/id", body, accessToken);

// DELETE
await api.del<void>("/endpoint/id", accessToken);
```

### Permission check in component

```tsx
const canWrite = useCan("assets:write");

{canWrite && <Button>Create</Button>}
{canWrite && <Trash2 onClick={() => del.mutate(id)} />}
```

---

## Database Quick Reference

### Key tables

| Table | PK | Tenant-scoped | Soft delete |
|-------|----|---------------|-------------|
| `Tenants` | UUID | — | No |
| `Users` | UUID | — | No |
| `TenantUsers` | (TenantId, UserId) | Yes | No |
| `Assets` | UUID | Yes | Yes (`DeletedAt`) |
| `AssetTypes` | UUID | Yes | No |
| `Categories` | UUID | Yes | No |
| `Locations` | UUID | Yes | No |
| `MaintenanceTickets` | UUID | Yes | No |
| `AssetHistory` | UUID | Yes | No |
| `Notifications` | UUID | Yes | No |
| `AuditLogs` | UUID | Yes | No |

### JSONB columns

| Table.Column | Shape |
|-------------|-------|
| `TenantUsers.ExtraPermissions` | `string[]` |
| `AssetTypes.FieldSchema` | `[{ key, label, type, required }]` |
| `Assets.FieldValues` | `{ [key]: value }` |
| `Notifications.Payload` | `{ [key]: any }` |

### Must-have query filters

```csharp
// Always filter by tenant
.Where(x => x.TenantId == user.TenantId)

// Assets: exclude soft-deleted
.Where(a => a.DeletedAt == null)

// Warranty expiring in 30 days
var today = DateOnly.FromDateTime(DateTime.UtcNow);
var cutoff = today.AddDays(30);
.Where(a => a.WarrantyUntil != null && a.WarrantyUntil >= today && a.WarrantyUntil <= cutoff)
```

---

## Git Workflow

```bash
# Start a feature
git checkout -b feature/my-feature

# Stage specific files (avoid git add -A)
git add web/src/app/my-page/page.tsx api/Features/MyFeature/

# Commit
git commit -m "feat: add my feature"

# Push
git push -u origin feature/my-feature

# Sync with main
git fetch origin main
git rebase origin/main
```

---

## Common Error → Fix

| Error | Fix |
|-------|-----|
| `Invalid hook call` at build | Move hooks above all conditional returns |
| `useSearchParams` suspense error | Wrap page component in `<Suspense>` |
| `401 Unauthorized` | Token expired — check refresh logic |
| `403 Forbidden` | User lacks permission — check `RequirePermission` on endpoint |
| `relation X does not exist` | Migration not applied — `dotnet ef database update` |
| `JSONB parse error` | Null JSONB column — use `?? []` in C# |
| Stale query after mutation | Add `qc.invalidateQueries(...)` in `onSuccess` |
| Cross-tenant data | Missing `.Where(x => x.TenantId == user.TenantId)` in query |

---

*AssetHub — Developer Cheat Sheet · May 2026*
