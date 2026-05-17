# AssetHub — Database Schema & How It Works

> A complete reference for the AssetHub PostgreSQL database: every table, every relationship, and the patterns that hold them together (multi-tenancy, soft deletes, JSONB custom fields, JWT-based access control).

---

## 1. Stack & Conventions

| Concern | Choice |
|---|---|
| Database | PostgreSQL |
| ORM | Entity Framework Core 9 (Npgsql provider) |
| Migrations | EF Core code-first (`dotnet ef migrations`) |
| Primary keys | `Guid` (UUID), generated client-side (`Guid.NewGuid()`) |
| Timestamps | `DateTimeOffset` (UTC) for everything except calendar dates |
| Calendar dates | `DateOnly` (e.g. `WarrantyUntil`, `PurchasedOn`) |
| Money | `decimal(18,2)` |
| Custom data | PostgreSQL `JSONB` columns (`JsonDocument` in C#) |
| Soft delete | `DeletedAt` column (only on `Asset`) |
| Multi-tenancy | `TenantId` column on every per-tenant table |

Source files:
- Entities: `api/Domain/Entities.cs`
- DbContext + indexes + relationships: `api/Infrastructure/AppDbContext.cs`
- Tenant/user resolution from JWT: `api/Infrastructure/TenantContext.cs`
- Permission constants: `api/Infrastructure/Permissions.cs`

---

## 2. Domain Map (Bird's-Eye View)

```
                    ┌──────────┐
                    │  Tenant  │  ← workspace (slug, plan, status)
                    └────┬─────┘
                         │ 1:N
            ┌────────────┼────────────┐
            ▼            ▼            ▼
    TenantMembership  TenantInvite  AssetCategory ──┐
            │                         │             │ self-ref (parent/child)
            ▼                         ▼             │
          User ────┐               AssetType ◀──────┘
                   │                  │
                   │ 1:N              │ 1:N
                   ▼                  ▼
            RefreshToken           Asset ──────────────┐
            PasswordResetToken      │                  │
                                    │ 1:N              │
            ┌───────────────────────┼──────────────────┤
            ▼            ▼          ▼          ▼       ▼
         AssetTag   AssetPhoto  AssetMovement Maintenance  Location (M:1)
                                              Ticket

   Cross-cutting tables (per-tenant): AuditEvent, Notification
```

There are 16 tables total. They fall into 4 functional groups:

| Group | Tables |
|---|---|
| **Identity & access** | `User`, `Tenant`, `TenantMembership`, `TenantInvite`, `RefreshToken`, `PasswordResetToken` |
| **Taxonomy (catalog)** | `AssetCategory`, `AssetType`, `Location` |
| **Operational data** | `Asset`, `AssetTag`, `AssetPhoto`, `AssetMovement`, `MaintenanceTicket` |
| **Cross-cutting** | `AuditEvent`, `Notification` |

---

## 3. Identity & Access

### `Tenant` — the workspace
A tenant is a customer workspace. Every business object below belongs to exactly one tenant; data never crosses tenants.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| Name | `varchar(120)` | Display name |
| Slug | `varchar(80)` **UNIQUE** | URL-safe identifier |
| Plan | `int` enum | `Free` / `Pro` / `Enterprise` |
| Status | `int` enum | `Active` / `Suspended` / `Deleted` |
| CreatedAt | `timestamptz` | |

### `User` — platform identity
A user is a person. One user can belong to many tenants via memberships. Authentication is global (one password per user, not per tenant).

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| Email | `varchar(180)` **UNIQUE** | Login identifier |
| Phone | `varchar(20)?` | Optional, for WhatsApp invites |
| DisplayName | `varchar(120)` | |
| PasswordHash | `varchar(200)` | BCrypt |
| EmailVerified | `bool` | |
| IsActive | `bool` | `false` blocks sign-in and revokes sessions |
| IsRootAdmin | `bool` | Platform super-admin (sees all tenants) |
| DeactivatedAt | `timestamptz?` | Audit only |
| CreatedAt | `timestamptz` | |
| LastLoginAt | `timestamptz?` | |

Indexes: `Email` UNIQUE, `Phone`, `IsRootAdmin`, `IsActive`.

### `TenantMembership` — the M:N join with a role + extra permissions
This is where the per-tenant role lives. A user is `Member` in one workspace and `Admin` in another.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` FK → `Tenant.Id` | cascade delete |
| UserId | `uuid` FK → `User.Id` | cascade delete |
| Role | `varchar(40)` | `Admin` / `Manager` / `Member` |
| IsOwner | `bool` | Workspace creator — cannot be demoted or removed |
| **ExtraPermissions** | `jsonb?` | Per-user permission grants beyond role defaults |
| CreatedAt | `timestamptz` | |

Composite UNIQUE on `(TenantId, UserId)` — a user has at most one membership per tenant.

**`ExtraPermissions` JSON shape:**
```json
["assets:write", "catalog:write"]
```
The full permission catalog lives in `api/Infrastructure/Permissions.cs` — see §7 below.

### `TenantInvite` — pending invitations
Created when an admin invites someone by email or WhatsApp; consumed when the invitee clicks the link.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` FK | |
| Email | `varchar(180)` | |
| Phone | `varchar(20)?` | |
| Channel | `varchar(20)?` | `Email` / `WhatsApp` |
| Role | `varchar(40)` | Role to assign on acceptance |
| Token | `varchar(80)` **UNIQUE** | Acceptance token |
| ExpiresAt | `timestamptz` | |
| AcceptedAt | `timestamptz?` | |
| CreatedBy | `uuid` | |
| CreatedAt | `timestamptz` | |

### `RefreshToken` & `PasswordResetToken`
Hashed, single-use, with expiry. Cascade-deleted with the user. Token hashes (not raw tokens) are stored — the raw token only exists in the user's cookie/email link.

---

## 4. Catalog (Taxonomy)

### `AssetCategory` — hierarchical groupings
Categories can have parents, producing a tree (e.g. *IT* → *Laptops*, *Monitors*).

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| ParentId | `uuid?` FK → self | **Restrict delete** — can't delete a parent that has children |
| Name | `varchar(120)` | |
| Icon | `varchar(40)?` | |
| Color | `varchar(20)?` | |
| CreatedAt | `timestamptz` | |

### `AssetType` — templates with a custom field schema
Defines what fields an asset of this type should have. The schema is stored as JSONB and consumed by the form renderer in the web UI.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| CategoryId | `uuid` FK | **Restrict delete** |
| Name | `varchar(120)` | |
| Icon | `varchar(40)?` | |
| **FieldSchema** | `jsonb?` | Array of field definitions |
| CreatedAt | `timestamptz` | |

**`FieldSchema` JSON shape:**
```json
[
  { "key": "serial",  "label": "Serial Number", "type": "string",  "required": true },
  { "key": "cpu",     "label": "CPU",           "type": "string"                     },
  { "key": "ram_gb",  "label": "RAM (GB)",      "type": "number"                     },
  { "key": "in_use",  "label": "In Use",        "type": "boolean"                    },
  { "key": "expires", "label": "Expires On",    "type": "date"                       }
]
```

### `Location` — physical places
Warehouses, offices, sites — anywhere assets live.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| Name | `varchar(120)` | "Mumbai Warehouse" |
| City | `varchar(60)?` | |
| Region | `varchar(60)?` | State / province |
| Country | `varchar(60)?` | |
| Address | `varchar(300)?` | |
| Code | `varchar(20)?` | Optional short code, e.g. `MUM-01` |
| IsActive | `bool` | Soft-disable without deleting |
| CreatedAt | `timestamptz` | |

---

## 5. Operational Data

### `Asset` — the core record
Everything else hangs off this.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| AssetTypeId | `uuid` FK | **Restrict delete** (types in use can't be deleted) |
| LocationId | `uuid?` FK | **Set null** if location is deleted |
| Name | `varchar(200)` | |
| Description | `varchar(2000)?` | |
| LocationDetail | `varchar(120)?` | Free text — e.g. "Aisle 3, Shelf B" |
| Quantity | `int` | Default 1 |
| Status | `int` enum | `InService` (0), `InStorage` (1), `InRepair` (2), `Retired` (3), `Lost` (4) |
| **FieldValues** | `jsonb?` | Values matching the AssetType's `FieldSchema` |
| PurchasePrice | `decimal(18,2)?` | |
| PurchasedOn | `date?` | |
| WarrantyUntil | `date?` | Drives "warranty expiring" dashboard KPI |
| AssignedToUserId | `uuid?` FK | **Set null** on user delete |
| CreatedBy | `uuid` | User who created |
| CreatedAt / UpdatedAt | `timestamptz` | |
| **DeletedAt** | `timestamptz?` | **Soft delete** — non-null rows are hidden from queries |

Indexes: `(TenantId, Name)`, `(TenantId, AssetTypeId)`, `(TenantId, Status)`, `(TenantId, LocationId)`, `DeletedAt`.

**`FieldValues` JSON shape:** mirrors the keys defined in `AssetType.FieldSchema`:
```json
{ "serial": "SN12345", "cpu": "Intel i7", "ram_gb": 16 }
```

### `AssetTag` — barcodes / QR codes
Multiple tags per asset; one is typically marked "active".

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| AssetId | `uuid` FK | **Cascade delete** |
| Code | `varchar(20)` | 10-char base32, UNIQUE per tenant |
| Format | `varchar(20)` | `QR` / `CODE128` / `DATAMATRIX` |
| Status | `int` enum | `Active` (0), `Retired` (1), `Lost` (2) |
| PrintedAt | `timestamptz?` | |
| RetiredAt | `timestamptz?` | |
| CreatedAt | `timestamptz` | |

### `AssetPhoto` — image attachments
File bytes live on disk (or object storage); the DB only tracks metadata.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId / AssetId | `uuid` | FK with **cascade delete** |
| FileName | `varchar(300)` | Original filename |
| StoragePath | `varchar(500)` | Path on disk / S3 key |
| ContentType | `varchar(60)` | MIME type |
| SizeBytes | `bigint` | |
| IsCover | `bool` | Primary photo flag |
| CreatedAt / CreatedBy | | |

### `AssetMovement` — operational audit log (move / checkout / checkin / status change)
Append-only. Drives the asset history timeline.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId / AssetId | `uuid` | FK with **cascade delete** |
| Kind | `varchar(40)` | `CheckOut` / `CheckIn` / `Move` / `Status` |
| FromLocation / ToLocation | `varchar(120)?` | |
| FromUserId / ToUserId | `uuid?` | |
| Notes | `varchar(500)?` | |
| PerformedBy | `uuid` | |
| PerformedAt | `timestamptz` | |

Composite index `(TenantId, AssetId, PerformedAt)` powers efficient per-asset history queries.

### `MaintenanceTicket` — repairs & inspections
| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId / AssetId | `uuid` | FK with **cascade delete** |
| Title | `varchar(200)` | |
| Description | `varchar(2000)?` | |
| Kind | enum | `Preventive` / `Corrective` / `Inspection` |
| Status | enum | `Open` / `InProgress` / `Done` / `Cancelled` |
| Priority | enum | `Low` / `Medium` / `High` / `Critical` |
| AssignedToUserId | `uuid?` FK | **Set null** on user delete |
| ScheduledFor | `timestamptz?` | |
| CompletedAt | `timestamptz?` | |
| Cost | `decimal(18,2)?` | |
| CreatedBy / CreatedAt / UpdatedAt | | |

---

## 6. Cross-Cutting Tables

### `AuditEvent` — security & change log
Captures every significant action: who, what, when, plus a JSONB payload with full before/after details.

| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId | `uuid` | |
| ActorUserId | `uuid?` | |
| ActorEmail | `varchar(180)?` | Snapshot — survives user deletion |
| Verb | `varchar(60)` | `Created` / `Updated` / `Deleted` / `Assigned` / ... |
| EntityType | `varchar(60)` | `Asset` / `MaintenanceTicket` / ... |
| EntityId | `uuid?` | |
| Summary | `varchar(300)` | Human-readable line |
| **Payload** | `jsonb?` | Old/new field snapshot |
| At | `timestamptz` | |

**`Payload` JSON shape:**
```json
{
  "old": { "status": "InService", "assignedTo": "user-123" },
  "new": { "status": "InRepair",  "assignedTo": "user-456" }
}
```

### `Notification` — in-app inbox
| Column | Type | Notes |
|---|---|---|
| Id | `uuid` PK | |
| TenantId / UserId | `uuid` | Recipient |
| Kind | `varchar(40)` | `AssetAssigned` / `MaintenanceAssigned` / ... |
| Title | `varchar(200)` | |
| Body | `varchar(500)?` | |
| Link | `varchar(200)?` | Deep link into the app |
| ReadAt | `timestamptz?` | `null` = unread |
| CreatedAt | `timestamptz` | |

---

## 7. Role & Permission Model

Roles are coarse-grained defaults; **permissions** are the actual access check.

### Permissions (`api/Infrastructure/Permissions.cs`)

| Key | Allows |
|---|---|
| `assets:write` | Create / edit / delete assets |
| `assets:checkout` | Check-in/out, move assets |
| `catalog:write` | Manage categories, asset types, locations |
| `maintenance:write` | Create / edit / close maintenance tickets |
| `import:write` | Bulk CSV import |
| `members:write` | Invite, change roles, manage permissions |

### Role defaults

| Role | Default permissions |
|---|---|
| **Admin** | All six |
| **Manager** | All except `members:write` |
| **Member** | None (read-only by default) |

### Effective permissions
```
effective = role-defaults  ∪  TenantMembership.ExtraPermissions
```
That's why a Member can be given `catalog:write` individually — they don't need to be promoted to Manager.

### Special flags
| Flag | Meaning |
|---|---|
| `TenantMembership.IsOwner` | Workspace creator. Always Admin. Cannot be demoted or removed. |
| `User.IsRootAdmin` | Platform super-admin. Sees the `/admin` console and all tenants. |

---

## 8. How a Request Is Authorized

1. **Login** issues a JWT containing: `sub` (user id), `tenant_id`, `role`, `perms` (comma-separated), `owner`, `root`. See `api/Infrastructure/JwtTokenService.cs`.
2. **Every API request** carries the JWT in `Authorization: Bearer …`.
3. `TenantContext.cs` reads the JWT claims into an `ICurrentUser` service (DI-injected into every endpoint).
4. Endpoints check permission before mutating:
   ```csharp
   if (!cu.Can(Perms.AssetsWrite)) return TypedResults.Forbid();
   ```
5. Every query is filtered by `TenantId == cu.TenantId` — tenant isolation is enforced at the query layer, not the database. (No PostgreSQL RLS yet.)

---

## 9. Multi-Tenancy: What's Enforced Where

| Layer | Enforcement |
|---|---|
| Database | `TenantId` column on every per-tenant table. No `FOREIGN KEY` on `TenantId` (it'd be redundant — every row implicitly belongs via its parent chain). |
| Query layer | Every `Where(... && t.TenantId == cu.TenantId)` is hand-written. |
| Indexes | Most are composite, leading with `TenantId` (e.g. `(TenantId, Status)`). Queries that don't include `TenantId` won't use these indexes — that's a feature, not a bug. |
| Future hardening | PostgreSQL Row-Level Security (RLS) could enforce this at the DB layer as defense-in-depth. Not implemented today. |

---

## 10. Soft Delete

Only `Asset` has `DeletedAt`. Conventions:

- **Set, don't delete:** `UPDATE assets SET deleted_at = now() WHERE id = ?`
- **All queries filter:** `WHERE deleted_at IS NULL`
- **Index:** `DeletedAt` is indexed so the filter is cheap.

Cascade behavior is unaffected — child tables (`AssetTag`, `AssetPhoto`, `AssetMovement`, `MaintenanceTicket`) still cascade-delete only on a hard delete of the parent.

> Other entities (Categories, Types, Locations) use **hard delete** with `Restrict` foreign keys — you can't delete a category that has types under it, etc.

---

## 11. JSONB Columns at a Glance

| Table | Column | Stores | Schema source |
|---|---|---|---|
| `TenantMembership` | `ExtraPermissions` | `["assets:write", ...]` | Validated against `Permissions.AllKnown` |
| `AssetType` | `FieldSchema` | Field definitions for assets of this type | Free-form (validated client-side) |
| `Asset` | `FieldValues` | Values for that asset's custom fields | Must match its AssetType's `FieldSchema` keys |
| `AuditEvent` | `Payload` | Old/new snapshot of an entity | Free-form per `EntityType` + `Verb` |

JSONB is queryable (you can `WHERE field_values->>'serial' = 'SN12345'`), and Postgres can index specific JSON paths with GIN indexes if needed.

---

## 12. Foreign-Key Cascade Cheat Sheet

| Parent → Child | On parent delete |
|---|---|
| Tenant → Membership / Invite | **Cascade** |
| User → Membership / RefreshToken / PasswordResetToken | **Cascade** |
| AssetCategory → AssetCategory (self) | **Restrict** |
| AssetCategory → AssetType | **Restrict** |
| AssetType → Asset | **Restrict** |
| Location → Asset | **Set Null** |
| User → Asset (`AssignedToUser`) | **Set Null** |
| Asset → AssetTag / AssetPhoto / AssetMovement / MaintenanceTicket | **Cascade** |
| User → MaintenanceTicket (`AssignedToUser`) | **Set Null** |

Rule of thumb: **cascade** for child records that are meaningless without their parent (photos without an asset), **restrict** for taxonomy (deleting a category in use shouldn't silently nuke assets), **set null** for optional assignments.

---

## 13. End-to-End Example: Creating an Asset

To make the relationships concrete, here's what happens when an Admin creates a new laptop asset:

1. **Login** — User authenticates → JWT issued with `tenant_id`, `role=Admin`, `perms=assets:write,...`.
2. **UI** — Admin opens `/assets/new`, selects category "IT" → type "Laptop" (loaded from `AssetType.FieldSchema`).
3. **Form renders** custom fields (serial, CPU, RAM) from the JSONB schema.
4. **POST `/api/assets`** with body `{ name, assetTypeId, locationId, fieldValues, … }`.
5. **API** checks `cu.Can("assets:write")` → ✓.
6. **Insert** into `Asset` with `TenantId = cu.TenantId`, `FieldValues` as JSONB.
7. **Auto-generate** an `AssetTag` (10-char base32 code) → printable QR.
8. **Insert** `AuditEvent` with `Verb = "Created"`, payload = full asset snapshot.
9. **Insert** `Notification` for any subscribed user (e.g. the assignee).
10. **Return** the created asset to the UI; React Query invalidates `["assets"]` and the list refreshes.

Later, when a user scans the QR code:
- `AssetTag.Code` is looked up (UNIQUE per tenant) → resolves to the asset.
- The asset detail page shows photos, movements, maintenance tickets, all joined by `AssetId`.

When the asset is checked out:
- `Asset.AssignedToUserId` updated.
- New `AssetMovement` row appended (Kind=`CheckOut`, FromUser=null, ToUser=…).
- New `AuditEvent` row appended.

When the asset is "deleted":
- `Asset.DeletedAt = now()` (soft delete).
- Tags / photos / movements / tickets stay in place — recoverable.
- All list queries filter them out via `WHERE DeletedAt IS NULL`.

---

## 14. Where to Look in the Code

| To understand… | Read… |
|---|---|
| What columns exist | `api/Domain/Entities.cs` |
| Indexes, FKs, cascade rules | `api/Infrastructure/AppDbContext.cs` (`OnModelCreating`) |
| How JWT claims become `ICurrentUser` | `api/Infrastructure/TenantContext.cs` |
| Available permissions and role defaults | `api/Infrastructure/Permissions.cs` |
| How JWT is built at login | `api/Infrastructure/JwtTokenService.cs` |
| Endpoint-level auth checks | `api/Features/**/Endpoints.cs` — search for `cu.Can(` |
| Migration history | `api/Migrations/` |

---

## 15. Future Hardening Ideas

These aren't bugs, just things worth considering as the system grows:

- **Row-Level Security (RLS)** in PostgreSQL keyed on `TenantId` — defense-in-depth so a query that forgets to filter can't leak across tenants.
- **GIN indexes on JSONB** columns once query patterns settle (e.g. `Asset.FieldValues->>'serial'`).
- **Outbox table** for `Notification` so cross-channel delivery (email/WhatsApp) is decoupled from the write transaction.
- **Partitioning `AuditEvent` and `AssetMovement` by month** once they grow into the millions of rows.
- **Soft delete on more entities** (Category, Type, Location) instead of `Restrict` FKs — friendlier UX when a category is mistakenly created.
