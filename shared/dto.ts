/**
 * Canonical client-side DTO definitions for AssetHub.
 *
 * Single source of truth for the shapes the .NET API returns. Imported via
 * `import type` from both `web/` and `mobile/` so the types are erased at
 * compile time — no bundler/path-alias plumbing is needed for the runtime.
 *
 * Conventions:
 *   - Use `string` for GUIDs (the API serialises them that way).
 *   - Use `string` (ISO-8601) for timestamps; parse to `Date` only at the edge.
 *   - Optional fields use `?` when the API may omit the property entirely,
 *     and `| null` when the API includes it with `null`.
 *
 * When the .NET DTO changes, update this file first, then both clients pick
 * up the change at the next typecheck.
 */

export type UserDto = {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  /** Present on web; mobile currently ignores it. Optional to keep DTOs aligned. */
  isRootAdmin?: boolean;
};

export type TenantRole = "Admin" | "Manager" | "Member";

export type TenantDto = {
  id: string;
  name: string;
  slug: string;
  role: TenantRole;
  plan: string;
  isOwner: boolean;
  permissions: string[];
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserDto;
  activeTenant: TenantDto;
  tenants: TenantDto[];
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Catalog ──────────────────────────────────────────────────────────

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  icon?: string;
  color?: string;
};

export type FieldSchemaItem = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "select";
  required?: boolean;
  options?: string[];
};

export type AssetTypeRecord = {
  id: string;
  categoryId: string;
  name: string;
  icon?: string;
  fieldSchema?: FieldSchemaItem[];
};

// ── Locations ────────────────────────────────────────────────────────

export type Location = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  isActive: boolean;
  assetCount: number;
};

// ── Assets ───────────────────────────────────────────────────────────

export type AssetStatus = "InService" | "InStorage" | "InRepair" | "Retired" | "Lost";

export type AssetListItem = {
  id: string;
  name: string;
  assetType: string;
  status: string;
  quantity: number;
  locationId: string | null;
  locationName: string | null;
  locationDetail: string | null;
  coverPhotoUrl: string | null;
  primaryTagCode: string | null;
  createdAt: string;
};

export type Tag = {
  id: string;
  code: string;
  format: string;
  status: string;
  createdAt: string;
  qrUrl: string;
};

export type Photo = {
  id: string;
  url: string;
  isCover: boolean;
  sizeBytes: number;
};

export type AssetDetail = {
  id: string;
  name: string;
  description: string | null;
  locationId: string | null;
  locationName: string | null;
  locationDetail: string | null;
  quantity: number;
  status: string;
  assetTypeId: string;
  assetTypeName: string;
  categoryId: string;
  categoryName: string;
  fieldValues: Record<string, unknown> | null;
  purchasePrice: number | null;
  purchasedOn: string | null;
  warrantyUntil: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  tags: Tag[];
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
};

// ── Operational ──────────────────────────────────────────────────────

export type MovementKind = "CheckOut" | "CheckIn" | "Move";

export type Movement = {
  id: string;
  kind: MovementKind;
  fromLocation: string | null;
  toLocation: string | null;
  /** Web exposes user IDs alongside names; mobile reads only the name fields. */
  fromUserId?: string | null;
  fromUserName: string | null;
  toUserId?: string | null;
  toUserName: string | null;
  notes: string | null;
  performedByName: string | null;
  performedAt: string;
};

export type AuditEvent = {
  id: string;
  verb: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  actorEmail: string | null;
  at: string;
};

export type MaintenanceKind = "Preventive" | "Corrective" | "Inspection";
export type MaintenanceStatus = "Open" | "InProgress" | "Done" | "Cancelled";
export type MaintenancePriority = "Low" | "Medium" | "High" | "Critical";

export type MaintenanceTicket = {
  id: string;
  assetId: string;
  assetName: string;
  title: string;
  description: string | null;
  kind: MaintenanceKind;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  assignedToUserId: string | null;
  assignedToName: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  cost: number | null;
  createdAt: string;
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};
