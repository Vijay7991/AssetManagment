/**
 * Browser-side API client. Reads the JWT from a cookie that was set after login.
 * Refresh-token rotation happens via /api/auth/refresh — see auth.ts.
 */

export const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export type ApiError = { status: number; message: string };

// ── Token-refresh hook ────────────────────────────────────────────────
// AuthProvider registers a callback that performs a /auth/refresh round-trip
// and resolves to the freshly-issued access token (or null on failure). The
// request helper invokes it once per 401 to transparently recover from
// expired access tokens, then retries the original call exactly once.
type RefreshCallback = () => Promise<string | null>;
let refreshCallback: RefreshCallback | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function setRefreshCallback(fn: RefreshCallback | null) {
  refreshCallback = fn;
}

function refreshOnce(): Promise<string | null> {
  if (!refreshCallback) return Promise.resolve(null);
  // Coalesce parallel 401s so a burst of failed requests triggers a single
  // refresh call rather than racing to rotate the refresh token N times.
  inflightRefresh ??= refreshCallback().finally(() => { inflightRefresh = null; });
  return inflightRefresh;
}

async function doFetch(path: string, init: RequestInit, auth: string | null | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: string | null; raw?: boolean; skipRefresh?: boolean } = {}
): Promise<T> {
  let res = await doFetch(path, init, opts.auth);

  // If the access token has expired mid-session, ask AuthProvider to refresh,
  // then retry the original request once with the freshly-issued token. Skip
  // for the refresh endpoint itself — otherwise an expired refresh token would
  // deadlock (refresh awaits itself).
  const isRefreshCall = path.startsWith("/auth/refresh");
  if (res.status === 401 && !opts.skipRefresh && !isRefreshCall && refreshCallback) {
    const newToken = await refreshOnce();
    if (newToken) {
      res = await doFetch(path, init, newToken);
    }
  }

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

// ── DTOs ─────────────────────────────────────────────────────────────
// Canonical definitions live in `/shared/dto.ts` so the web and mobile
// clients can't drift. Re-exported here as types so existing imports of
// the form `import { AssetDetail } from "@/lib/api"` keep working.

export type {
  UserDto,
  TenantDto,
  TenantRole,
  AuthResponse,
  Paged,
  Category,
  AssetTypeRecord,
  FieldSchemaItem,
  Location,
  AssetStatus,
  AssetListItem,
  Tag,
  Photo,
  AssetDetail,
  MovementKind,
  Movement,
  AuditEvent,
  MaintenanceKind,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceTicket,
  Notification,
  ImportResult,
} from "@shared/dto";

// ── Web-only runtime values ──────────────────────────────────────────

export const PERMISSIONS = [
  { key: "assets:write", label: "Create / edit / delete assets" },
  { key: "assets:checkout", label: "Check out, check in, move assets" },
  { key: "catalog:write", label: "Manage categories, asset types, locations" },
  { key: "maintenance:write", label: "Create and manage maintenance tickets" },
  { key: "import:write", label: "Bulk-import assets via CSV" },
  { key: "members:write", label: "Invite and manage workspace members" },
] as const;
