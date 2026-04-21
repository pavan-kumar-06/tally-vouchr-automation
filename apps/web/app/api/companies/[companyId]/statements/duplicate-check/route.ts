import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { statement } from "@vouchr/db";
import { getCompanyForOrg, resolveSessionOrg } from "@/lib/org-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const ctx = await resolveSessionOrg();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  const companyEntity = await getCompanyForOrg(companyId, ctx.orgId);
  if (!companyEntity) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const filename = url.searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const lower = filename.toLowerCase();
  const existing = await db.query.statement.findFirst({
    where: and(eq(statement.companyId, companyId), sql`lower(${statement.filename}) = ${lower}`)
  });

  return NextResponse.json({
    exists: Boolean(existing),
    statementId: existing?.id ?? null
  });
}
