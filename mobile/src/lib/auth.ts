import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, AuthResponse, TenantDto, UserDto } from "./api";

const KEY = "assethub.auth.v1";

type State = {
  user: UserDto | null;
  activeTenant: TenantDto | null;
  tenants: TenantDto[];
  accessToken: string | null;
  loading: boolean;
};

type Ctx = State & {
  login: (email: string, password: string) => Promise<void>;
  signup: (req: { email: string; password: string; displayName: string; workspaceName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

async function persist(data: AuthResponse | null) {
  if (data) await SecureStore.setItemAsync(KEY, JSON.stringify(data));
  else await SecureStore.deleteItemAsync(KEY);
}

async function load(): Promise<AuthResponse | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    user: null,
    activeTenant: null,
    tenants: [],
    accessToken: null,
    loading: true,
  });

  const apply = useCallback(async (res: AuthResponse) => {
    await persist(res);
    setState({
      user: res.user,
      activeTenant: res.activeTenant,
      tenants: res.tenants,
      accessToken: res.accessToken,
      loading: false,
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/api/auth/login", { email, password });
    await apply(res);
  }, [apply]);

  const signup = useCallback(async (req: { email: string; password: string; displayName: string; workspaceName?: string }) => {
    const res = await api.post<AuthResponse>("/api/auth/signup", req);
    await apply(res);
  }, [apply]);

  const logout = useCallback(async () => {
    const stored = await load();
    if (stored?.refreshToken) {
      try {
        await api.post("/api/auth/logout", { refreshToken: stored.refreshToken }, stored.accessToken);
      } catch { /* swallow */ }
    }
    await persist(null);
    setState({ user: null, activeTenant: null, tenants: [], accessToken: null, loading: false });
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    const stored = await load();
    if (!stored) return;
    const res = await api.post<AuthResponse>(`/api/auth/switch-tenant/${tenantId}`, undefined, stored.accessToken);
    await apply(res);
  }, [apply]);

  const refresh = useCallback(async () => {
    const stored = await load();
    if (!stored?.refreshToken) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    try {
      const res = await api.post<AuthResponse>("/api/auth/refresh", { refreshToken: stored.refreshToken });
      await apply(res);
    } catch {
      await persist(null);
      setState({ user: null, activeTenant: null, tenants: [], accessToken: null, loading: false });
    }
  }, [apply]);

  // Hydrate on mount
  useEffect(() => {
    (async () => {
      const stored = await load();
      if (stored) {
        setState({
          user: stored.user,
          activeTenant: stored.activeTenant,
          tenants: stored.tenants,
          accessToken: stored.accessToken,
          loading: false,
        });
        const exp = new Date(stored.expiresAt).getTime();
        if (exp - Date.now() < 60_000) refresh();
      } else {
        setState(s => ({ ...s, loading: false }));
      }
    })();
  }, [refresh]);

  return React.createElement(AuthCtx.Provider, { value: { ...state, login, signup, logout, switchTenant, refresh } }, children);
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useCan(permission: string): boolean {
  const { activeTenant } = useAuth();
  if (!activeTenant) return false;
  return activeTenant.permissions?.includes(permission) ?? false;
}
