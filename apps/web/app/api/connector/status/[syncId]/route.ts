import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export async function GET(request: Request, { params }: { params: Promise<{ syncId: string }> }) {
  const { syncId } = await params;
  const env = getEnv();

  const workerUrl = `${env.WORKER_BASE_URL}/v1/connector/status/${syncId}`;

  // Forward the JWT cookies from the incoming request to Python BE
  const cookieHeader = request.headers.get("cookie") || "";

  let res;
  try {
    res = await fetch(workerUrl, {
      headers: {
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Worker unreachable" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}