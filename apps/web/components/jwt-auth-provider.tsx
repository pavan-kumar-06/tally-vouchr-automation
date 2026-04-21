"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * JWTLinkEffect — runs on app mount.
 * If user is logged in (Better Auth session exists), links JWT from Python BE.
 * Creates an org if user doesn't have one yet.
 */
export function JWTLinkEffect() {
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const link = async () => {
      // Check if user has a Better Auth session
      const result = await authClient.getSession();
      const session = result?.data as { user?: { id: string; email: string }; organization?: { id: string; role: string } } | null;
      if (!session?.user) return;

      // Get org_id — use organization.id from session
      let orgId = session.organization?.id || "";
      if (!orgId) {
        // Create a default org for this user
        try {
          const orgRes = await authClient.organization.create({
            name: "My Organization",
            slug: `org-${session.user.id.substring(0, 8)}`
          });
          if (orgRes?.data) {
            orgId = orgRes.data.id;
          }
        } catch {
          // Use a placeholder if org creation fails
          orgId = `org_${session.user.id}`;
        }
      }

      if (cancelled) return;
      try {
        const res = await fetch("/api/auth/jwt/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            user_id: session.user.id,
            org_id: orgId,
            role: session.organization?.role || "owner",
          }),
        });
        if (res.ok && !cancelled) setLinked(true);
      } catch {
        // Silent fail
      }
    };

    link();
    return () => { cancelled = true; };
  }, []);

  return null;
}
