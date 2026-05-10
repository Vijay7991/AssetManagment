"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AuthResponse, TenantDto, UserDto } from "./api";

type AuthState = {
  user: UserDto | null;
  activeTenant: TenantDto | null;
  tenants: TenantDto[];
  accessToken: string | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  signup: (req: { email: string; password: string; displayName: string; workspaceName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = "assethub.auth.v1";

const Ctx = createContext<AuthContextValue | null>(null);

function persist(data: AuthResponse | null) {
  if (typeof window === "undefined") return;
  if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  else localStorage.removeItem(STORAGE_KEY);
}

function load(): AuthResponse | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    activeTenant: null,
    tenants: [],
    accessToken: null,
    loading: true,
  });

  const apply = useCallback((res: AuthResponse) => {
    persist(res);
    setState({
      user: res.user,
      activeTenant: res.activeTenant,
      tenants: res.tenants,
      accessToken: res.accessToken,
      loading: false,
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { email, password });
    apply(res);
  }, [apply]);

  const signup = useCallback(async (req: { email: string; password: string; displayName: string; workspaceName?: string }) => {
    const res = await api.post<AuthResponse>("/auth/signup", req);
    apply(res);
  }, [apply]);

  const logout = useCallback(async () => {
    const stored = load();
    if (stored?.refreshToken) {
      try {
        await api.post("/auth/logout", { refreshToken: stored.refreshToken }, stored.accessToken);
      } catch { /* swallow */ }
    }
    persist(null);
    setState({ user: null, activeTenant: null, tenants: [], accessToken: null, loading: false });
    router.push("/login");
  }, [router]);

  const switchTenant = useCallback(async (tenantId: string) => {
    const stored = load();
    if (!stored) return;
    const res = await api.post<AuthResponse>(`/auth/switch-tenant/${tenantId}`, undefined, stored.accessToken);
    apply(res);
    router.refresh();
  }, [apply, router]);

  const refresh = useCallback(async () => {
    const stored = load();
    if (!stored?.refreshToken) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    try {
      const res = await api.post<AuthResponse>("/auth/refresh", { refreshToken: stored.refreshToken });
      apply(res);
    } catch {
      persist(null);
      setState({ user: null, activeTenant: null, tenants: [], accessToken: null, loading: false });
    }
  }, [apply]);

  // Hydrate on mount
  useEffect(() => {
    const stored = load();
    if (stored) {
      setState({
        user: stored.user,
        activeTenant: stored.activeTenant,
        tenants: stored.tenants,
        accessToken: stored.accessToken,
        loading: false,
      });
      // Check if access token is fresh-ish; if expired, attempt refresh
      const exp = new Date(stored.expiresAt).getTime();
      if (exp - Date.now() < 60_000) {
        refresh();
      }
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }, [refresh]);

  return (
    <Ctx.Provider value={{ ...state, login, signup, logout, switchTenant, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/// Returns whether the current user has a given permission in the active tenant.
export function useCan(permission: string): boolean {
  const { activeTenant } = useAuth();
  if (!activeTenant) return false;
  return activeTenant.permissions?.includes(permission) ?? false;
}
