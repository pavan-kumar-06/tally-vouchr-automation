import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export async function POST(request: Request) {
  const env = getEnv();

  const body: { companyId?: string; orgId?: string; tallyRemoteId?: string } = await request.json();
  const { companyId, orgId, tallyRemoteId } = body;

  if (!companyId || !orgId || !tallyRemoteId) {
    return NextResponse.json({ error: "companyId, orgId, and tallyRemoteId are required" }, { status: 400 });
  }

  // Forward to Python Worker BE
  const workerUrl = `${env.WORKER_BASE_URL}/v1/connector/sync-masters`;

  const cookieHeader = request.headers.get("cookie") || "";

  let res;
  try {
    res = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-connector-token": env.CONNECTOR_SHARED_TOKEN,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        company_id: companyId,
        org_id: orgId,
        tally_remote_id: tallyRemoteId,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: "Worker unreachable", details: String(err) }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}