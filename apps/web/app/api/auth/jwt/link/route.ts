import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

/**
 * Called by the frontend after Better Auth login to link the session with Python BE JWT.
 *
 * The frontend calls authClient.getSession() client-side (which works),
 * extracts user info, and POSTs it here. Python BE issues JWT cookies.
 */
export async function POST(request: Request) {
  const env = getEnv();

  let body: { email?: string; user_id?: string; org_id?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, user_id, org_id, role } = body;
  if (!email || !user_id) {
    return NextResponse.json({ error: "Missing required fields: email, user_id" }, { status: 400 });
  }

  const workerUrl = `${env.WORKER_BASE_URL}/auth/link-session`;

  let beRes: Response;
  try {
    beRes = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, user_id, org_id, role: role || "user" }),
    });
  } catch (err) {
    return NextResponse.json({ error: "Worker unreachable", details: String(err) }, { status: 502 });
  }

  if (!beRes.ok) {
    return NextResponse.json({ error: "Failed to create JWT session" }, { status: 500 });
  }

  // Forward cookies from Python BE to the browser
  const setCookieHeaders = beRes.headers.getSetCookie?.();
  const nextResponse = NextResponse.json({ ok: true });

  if (setCookieHeaders) {
    for (const header of setCookieHeaders) {
      nextResponse.headers.append("Set-Cookie", header);
    }
  }

  return nextResponse;
}
