import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { company } from "@vouchr/db";
import { getEnv } from "@/lib/env";
import { isNotNull } from "drizzle-orm";

export async function GET(request: Request) {
  const env = getEnv();
  const connectorToken = request.headers.get("x-connector-token");
  
  if (connectorToken !== env.CONNECTOR_SHARED_TOKEN) {
    console.log("[mapped-companies] Unauthorized — token mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = request.headers.get("x-organization-id");
  console.log(`[mapped-companies] Request from connector. x-organization-id: ${organizationId}`);

  // LOCAL MODE: since the connector uses 'desktop-local' as org ID but the
  // local DB has a real UUID, we return ALL companies that have a tally mapping.
  const mappedCompanies = await db.query.company.findMany({
    where: isNotNull(company.tallyCompanyRemoteId),
    columns: {
      tallyCompanyRemoteId: true,
      name: true,
      organizationId: true
    }
  });

  const remoteIds = mappedCompanies.map(c => c.tallyCompanyRemoteId).filter(Boolean) as string[];
  
  console.log(`[mapped-companies] Found ${mappedCompanies.length} mapped companies:`, remoteIds);

  return NextResponse.json({ mappedRemoteIds: remoteIds });
}
