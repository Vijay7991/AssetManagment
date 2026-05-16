import { getServerUrl } from "./server";

export type ApiError = { status: number; message: string };

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: string | null; raw?: boolean } = {}
): Promise<T> {
  const base = await getServerUrl();
  if (!base) throw { status: 0, message: "Server URL not set" } satisfies ApiError;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.auth) headers.set("Authorization", `Bearer ${opts.auth}`);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch (e: any) {
    throw { status: 0, message: e?.message || "Network error" } satisfies ApiError;
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
};

export async function buildPhotoUrl(photoId: string): Promise<string> {
  const base = await getServerUrl();
  return `${base}/api/files/photos/${photoId}`;
}

// ── DTOs (must match the .NET API) ────────────────────────────────

export type UserDto = { id: string; email: string; displayName: string; phone?: string };

export type TenantDto = {
  id: string;
  name: string;
  slug: string;
  role: "Admin" | "Manager" | "Member";
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

export type Movement = {
  id: string;
  kind: "CheckOut" | "CheckIn" | "Move";
  fromLocation: string | null;
  toLocation: string | null;
  fromUserName: string | null;
  toUserName: string | null;
  notes: string | null;
  performedByName: string | null;
  performedAt: string;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
