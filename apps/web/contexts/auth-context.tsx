"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  role: string;
}

interface AuthSession {
  user: User;
  organization: Organization;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  refetch: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/me`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as AuthSession;
        setSession(data);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Periodic token refresh every 12 minutes (JWT TTL is 15 min)
  React.useEffect(() => {
    const scheduleRefresh = () => {
      refreshTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });
        } catch {
          // refresh failed, user will re-login when JWT expires
        }
        scheduleRefresh();
      }, 12 * 60 * 1000);
    };
    scheduleRefresh();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ session, loading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useSession() {
  return useContext(AuthContext);
}
