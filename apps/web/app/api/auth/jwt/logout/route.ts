import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

/**
 * Logout: calls Python BE to clear JWT cookies.
 */
export async function POST() {
  const env = getEnv();
  const workerUrl = `${env.WORKER_BASE_URL}/auth/logout`;

  try {
    await fetch(workerUrl, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best effort - clear local cookies regardless
  }

  return NextResponse.json({ ok: true });
}
