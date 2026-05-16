import * as SecureStore from "expo-secure-store";

const KEY = "assethub.server.url";

let cachedUrl: string | null = null;

/// Get the AssetHub server URL the user configured on first launch.
/// Trailing slashes are stripped. Returns null if never set.
export async function getServerUrl(): Promise<string | null> {
  if (cachedUrl !== null) return cachedUrl;
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v) cachedUrl = v.replace(/\/$/, "");
    return cachedUrl;
  } catch {
    return null;
  }
}

export async function setServerUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/$/, "");
  await SecureStore.setItemAsync(KEY, cleaned);
  cachedUrl = cleaned;
}

export async function clearServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  cachedUrl = null;
}

/// Quick health check; returns true if the URL responds with a 200 from /api/health.
export async function probeServer(url: string): Promise<{ ok: boolean; message?: string }> {
  const cleaned = url.trim().replace(/\/$/, "");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${cleaned}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
    const body = await res.json();
    return { ok: body?.status === "ok", message: body?.status };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Connection failed" };
  }
}
