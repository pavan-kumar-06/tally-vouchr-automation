"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // refresh every 12 minutes (JWT expires in 15)

/**
 * useJWTAuth — manages JWT lifecycle for Python BE calls.
 *
 * Usage:
 *   const { loading, error, refresh } = useJWTAuth();
 *
 * After Better Auth login, call refresh() to fetch JWT cookies from Python BE.
 */
export function useJWTAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleRefresh = () => {
    clearRefreshTimer();
    timerRef.current = setTimeout(() => {
      refresh().catch(console.error);
    }, REFRESH_INTERVAL_MS);
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/jwt/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      scheduleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  };

  /** Call this after Better Auth login to link the session with Python BE JWT */
  const linkSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/jwt/link", { method: "POST" });
      if (!res.ok) throw new Error("Failed to link session");
      scheduleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLoading(false);
    }
  };

  /** Call this to log out from Python BE (clears JWT cookies) */
  const logout = async () => {
    clearRefreshTimer();
    await fetch("/api/auth/jwt/logout", { method: "POST" }).catch(() => {});
  };

  /** Check if user is logged in via Better Auth */
  const isLoggedIn = async () => {
    const result = await authClient.getSession();
    return !!result?.data?.user;
  };

  useEffect(() => {
    // On mount: attempt silent refresh if we already have a refresh token cookie
    refresh().catch(() => {
      // Silent fail — user may not be logged in yet
    });
    return clearRefreshTimer;
  }, []);

  return { loading, error, linkSession, refresh, logout, isLoggedIn };
}
