/**
 * Browser-side API client. Reads the JWT from a cookie that was set after login.
 * Refresh-token rotation happens via /api/auth/refresh — see auth.ts.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export type ApiError = { status: number; message: string };

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: string | null; raw?: boolean } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.auth) headers.set("Authorization", `Bearer ${opts.auth}`);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body === "string" ? body : body.message || JSON.stringify(body);
    } catch {
      // ignore
    }
    throw { status: res.status, message } satisfies ApiError;
  }

  if (res.status === 204 || opts.raw) return undefined as T;
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(p: string, auth?: string | null) => request<T>(p, { method: "GET" }, { auth }),
  post: <T>(p: string, body?: unknown, auth?: string | null) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, { auth }),
  put: <T>(p: string, body?: unknown, auth?: string | null) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, { auth }),
  del: <T>(p: string, auth?: string | null) => request<T>(p, { method: "DELETE" }, { auth }),
  upload: <T>(p: string, file: File, auth?: string | null) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>(p, { method: "POST", body: fd }, { auth });
  },
};

// ── Types matching the API DTOs ──────────────────────────────────────

export type UserDto = {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
};

export type TenantDto = {
  id: string;
  name: string;
  slug: string;
  role: "Admin" | "Manager" | "Member";
  plan: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserDto;
  activeTenant: TenantDto;
  tenants: TenantDto[];
};

export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  icon?: string;
  color?: string;
};

export type AssetTypeRecord = {
  id: string;
  categoryId: string;
  name: string;
  icon?: string;
  fieldSchema?: FieldSchemaItem[];
};

export type FieldSchemaItem = {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "select";
  required?: boolean;
  options?: string[];
};

export type AssetListItem = {
  id: string;
  name: string;
  assetType: string;
  status: string;
  quantity: number;
  location: string | null;
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
  location: string | null;
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

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Phase 2 types ────────────────────────────────────────────────────

export type Movement = {
  id: string;
  kind: "CheckOut" | "CheckIn" | "Move";
  fromLocation: string | null;
  toLocation: string | null;
  fromUserId: string | null;
  fromUserName: string | null;
  toUserId: string | null;
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

export type MaintenanceTicket = {
  id: string;
  assetId: string;
  assetName: string;
  title: string;
  description: string | null;
  kind: "Preventive" | "Corrective" | "Inspection";
  status: "Open" | "InProgress" | "Done" | "Cancelled";
  priority: "Low" | "Medium" | "High" | "Critical";
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
