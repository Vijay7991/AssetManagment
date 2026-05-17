import { getServerUrl } from "./server";

export type ApiError = { status: number; message: string };

// ── Token-refresh hook ────────────────────────────────────────────────
// AuthProvider registers a callback that performs a /auth/refresh round-trip
// and resolves to the freshly-issued access token (or null on failure). The
// request helper invokes it once per 401 to transparently recover from
// expired access tokens.
type RefreshCallback = () => Promise<string | null>;
let refreshCallback: RefreshCallback | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function setRefreshCallback(fn: RefreshCallback | null) {
  refreshCallback = fn;
}

function refreshOnce(): Promise<string | null> {
  if (!refreshCallback) return Promise.resolve(null);
  inflightRefresh ??= refreshCallback().finally(() => { inflightRefresh = null; });
  return inflightRefresh;
}

async function doFetch(base: string, path: string, init: RequestInit, auth: string | null | undefined): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  return fetch(`${base}${path}`, { ...init, headers });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: string | null; raw?: boolean; skipRefresh?: boolean } = {}
): Promise<T> {
  // getServerUrl now always returns a string (defaults to production URL),
  // so callers never need to handle a null base. Falsy check kept defensively.
  const base = await getServerUrl();
  if (!base) throw { status: 0, message: "Server URL not configured" } satisfies ApiError;

  let res: Response;
  try {
    res = await doFetch(base, path, init, opts.auth);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Network error";
    throw { status: 0, message } satisfies ApiError;
  }

  // Transparent refresh-and-retry on 401, except for the refresh endpoint
  // itself (otherwise an expired refresh token would deadlock).
  const isRefreshCall = path.startsWith("/api/auth/refresh");
  if (res.status === 401 && !opts.skipRefresh && !isRefreshCall && refreshCallback) {
    const newToken = await refreshOnce();
    if (newToken) {
      try {
        res = await doFetch(base, path, init, newToken);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Network error";
        throw { status: 0, message } satisfies ApiError;
      }
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body === "string" ? body : body?.message || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw { status: res.status, message } satisfies ApiError;
  }

  if (res.status === 204 || opts.raw) return undefined as T;
  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T,>(p: string, auth?: string | null) => request<T>(p, { method: "GET" }, { auth }),
  post: <T,>(p: string, body?: unknown, auth?: string | null) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, { auth }),
  put: <T,>(p: string, body?: unknown, auth?: string | null) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, { auth }),
  del: <T,>(p: string, auth?: string | null) => request<T>(p, { method: "DELETE" }, { auth }),
  /// Upload a single file as multipart/form-data. Used for asset photos.
  /// Pass a local URI (e.g. from expo-image-picker) — we wrap it into the
  /// React Native FormData shape, which differs from web FormData.
  upload: <T,>(p: string, file: { uri: string; name: string; type: string }, auth?: string | null) => {
    const fd = new FormData();
    // RN's FormData accepts this shape — cast to any to satisfy TS.
    fd.append("file", { uri: file.uri, name: file.name, type: file.type } as any);
    return request<T>(p, { method: "POST", body: fd }, { auth });
  },
};

export async function buildPhotoUrl(photoId: string): Promise<string> {
  const base = await getServerUrl();
  return `${base}/api/files/photos/${photoId}`;
}

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
  AssetStatus,
  AssetListItem,
  Tag,
  Photo,
  AssetDetail,
  Category,
  Location,
  AssetTypeRecord,
  FieldSchemaItem,
  UnitListItem,
  UnitDetail,
  UnitScanResult,
  ScanResult,
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
