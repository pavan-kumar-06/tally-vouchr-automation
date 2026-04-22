"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type SessionOrg = {
  id: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  organization: SessionOrg | null;
  loading: boolean;
  authenticated: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (payload: {
    name: string;
    email: string;
    password: string;
    organizationName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type SessionResponse = {
  user: SessionUser;
  organization: SessionOrg;
};

async function parseJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organization, setOrganization] = useState<SessionOrg | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setOrganization(null);
  }, []);

  const applySession = useCallback((session: SessionResponse | null) => {
    if (!session?.user || !session?.organization) {
      clearSession();
      return;
    }
    setUser(session.user);
    setOrganization(session.organization);
  }, [clearSession]);

  const bootstrap = useCallback(async () => {
    const meRes = await apiFetch("/auth/me");
    if (meRes.ok) {
      applySession(await parseJson<SessionResponse>(meRes));
      return;
    }

    if (meRes.status === 401) {
      const refreshRes = await apiFetch("/auth/refresh", { method: "POST" });
      if (refreshRes.ok) {
        const retry = await apiFetch("/auth/me");
        if (retry.ok) {
          applySession(await parseJson<SessionResponse>(retry));
          return;
        }
      }
    }

    clearSession();
  }, [applySession, clearSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await bootstrap();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const body = await parseJson<{ user?: SessionUser; organization?: SessionOrg; detail?: string }>(res);
    if (!res.ok || !body?.user || !body?.organization) {
      return { ok: false, error: body?.detail || "Login failed" };
    }

    applySession({ user: body.user, organization: body.organization });
    return { ok: true };
  }, [applySession]);

  const signup = useCallback(async (payload: { name: string; email: string; password: string; organizationName?: string }) => {
    const res = await apiFetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        organization_name: payload.organizationName,
      }),
    });

    const body = await parseJson<{ user?: SessionUser; organization?: SessionOrg; detail?: string }>(res);
    if (!res.ok || !body?.user || !body?.organization) {
      return { ok: false, error: body?.detail || "Signup failed" };
    }

    applySession({ user: body.user, organization: body.organization });
    return { ok: true };
  }, [applySession]);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      organization,
      loading,
      authenticated: Boolean(user),
      bootstrap,
      login,
      signup,
      logout,
    }),
    [user, organization, loading, bootstrap, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
