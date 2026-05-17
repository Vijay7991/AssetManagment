import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const KEY = "assethub.server.url";

/// The production AssetHub base URL. Used by default when the user hasn't
/// chosen a different server. Read from app.json `extra.defaultServerUrl` so
/// it can be overridden per-environment without touching code.
export const DEFAULT_SERVER_URL: string =
  (Constants.expoConfig?.extra as { defaultServerUrl?: string } | undefined)
    ?.defaultServerUrl?.replace(/\/$/, "") || "https://www.asset-hub.uk";

let cachedUrl: string | null = null;

/// Get the AssetHub server URL.
/// If the user explicitly chose one on setup, use it; otherwise fall back to
/// the production default so the app works out-of-the-box on first install.
/// Trailing slashes are stripped.
export async function getServerUrl(): Promise<string> {
  if (cachedUrl !== null) return cachedUrl;
  try {
    const v = await SecureStore.getItemAsync(KEY);
    cachedUrl = (v ? v.replace(/\/$/, "") : null) || DEFAULT_SERVER_URL;
    return cachedUrl;
  } catch {
    cachedUrl = DEFAULT_SERVER_URL;
    return cachedUrl;
  }
}

/// Returns true only when the user has explicitly stored a non-default URL.
/// Used by the entry screen to decide whether to bypass /setup.
export async function hasCustomServerUrl(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return !!v && v.replace(/\/$/, "") !== DEFAULT_SERVER_URL;
  } catch {
    return false;
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
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${cleaned}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
    try {
      const body = await res.json();
      return { ok: body?.status === "ok" || res.ok, message: body?.status };
    } catch {
      // /api/health may return plain text — a 200 is still good enough.
      return { ok: true };
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || "Connection failed" };
  }
}
