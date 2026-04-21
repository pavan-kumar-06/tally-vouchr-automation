import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tallyDiscovery } from "@vouchr/db";
import { eq, desc } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { z } from "zod";

const requestSchema = z.object({
  organizationId: z.string().min(1),
  companies: z.array(
    z.object({
      name: z.string().min(1),
      remoteId: z.string().optional(),
      guid: z.string().optional()
    })
  )
});

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const connectorToken = request.headers.get("x-connector-token");
    
    if (connectorToken !== env.CONNECTOR_SHARED_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { organizationId, companies } = requestSchema.parse(await request.json());
    const now = new Date();

    await Promise.all(
      companies.map((c) => {
        const bestId = c.remoteId || c.guid || c.name;
        return db
          .insert(tallyDiscovery)
          .values({
            id: `td_${crypto.randomUUID().replaceAll("-", "")}`,
            organizationId,
            tallyCompanyName: c.name,
            tallyCompanyRemoteId: bestId,
            lastSeenAt: now
          })
          .onConflictDoUpdate({
            target: [tallyDiscovery.organizationId, tallyDiscovery.tallyCompanyRemoteId],
            set: {
              tallyCompanyName: c.name,
              lastSeenAt: now
            }
          });
      })
    );

    return NextResponse.json({ ok: true, count: companies.length });
  } catch (err: any) {
    console.error("DISCOVERY API CRASHED:", err);
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 });
  }
}

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // NOTE: connector stores all discoveries under VOUCHR_ORG_ID (hardcoded).
  // For now, return all discoveries since this is a small-team SaaS.
  // The mapped-companies table properly scopes by org for actual company data.
  const items = await db.query.tallyDiscovery.findMany({
    orderBy: [desc(tallyDiscovery.lastSeenAt)]
  });
  return NextResponse.json(items);
}
