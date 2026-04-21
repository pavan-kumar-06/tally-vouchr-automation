import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

/**
 * Silent refresh: reads refresh token from cookies, calls Python BE
 * to get new access + refresh tokens.
 */
export async function POST() {
  const env = getEnv();
  const workerUrl = `${env.WORKER_BASE_URL}/auth/refresh`;

  let response: Response;
  try {
    response = await fetch(workerUrl, {
      method: "POST",
      credentials: "include", // sends the existing refresh token cookie
    });
  } catch (err) {
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  // Forward updated cookies from Python BE
  const setCookieHeaders = response.headers.getSetCookie?.();
  const nextResponse = NextResponse.json({ ok: true });

  if (setCookieHeaders) {
    for (const header of setCookieHeaders) {
      nextResponse.headers.append("Set-Cookie", header);
    }
  }

  return nextResponse;
}
