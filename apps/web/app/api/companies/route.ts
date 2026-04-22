import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const companies = await db.query.company.findMany({
    where: eq(company.organizationId, orgId)
  });
  return NextResponse.json(companies);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.session.activeOrganizationId;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const body = (await request.json()) as Record<string, unknown>;
  const env = getEnv();

  const res = await fetch(`${env.WORKER_BASE_URL}/api/companies`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
    body: JSON.stringify({ ...body, orgId }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

import { db } from "@/lib/db";
import { company } from "@vouchr/db";
import { eq } from "drizzle-orm";