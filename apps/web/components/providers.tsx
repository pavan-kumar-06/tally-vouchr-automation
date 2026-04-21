"use client";

import { JWTLinkEffect } from "@/components/jwt-auth-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JWTLinkEffect />
      {children}
    </>
  );
}
