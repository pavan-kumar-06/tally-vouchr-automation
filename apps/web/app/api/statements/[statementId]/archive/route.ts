import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCompanyForOrg, resolveSessionOrg } from "@/lib/org-context";
import { statement } from "@vouchr/db";

const bodySchema = z.object({
  archived: z.boolean().default(true)
});

export async function POST(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const ctx = await resolveSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { statementId } = await params;
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const row = await db.query.statement.findFirst({ where: eq(statement.id, statementId) });
  if (!row) return NextResponse.json({ error: "Statement not found" }, { status: 404 });

  const companyEntity = await getCompanyForOrg(row.companyId, ctx.orgId);
  if (!companyEntity) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.status === "PROCESSING") {
    return NextResponse.json({ error: "Cannot archive while processing" }, { status: 400 });
  }

  await db
    .update(statement)
    .set({
      status: body.archived ? "ARCHIVED" : "REVIEW",
      updatedAt: new Date()
    })
    .where(eq(statement.id, row.id));

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const ctx = await resolveSessionOrg();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { statementId } = await params;
  const row = await db.query.statement.findFirst({ where: eq(statement.id, statementId) });
  if (!row) return NextResponse.json({ error: "Statement not found" }, { status: 404 });

  const companyEntity = await getCompanyForOrg(row.companyId, ctx.orgId);
  if (!companyEntity) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.status === "PROCESSING") {
    return NextResponse.json({ error: "Cannot delete while processing" }, { status: 400 });
  }

  await db
    .update(statement)
    .set({
      status: "DELETED",
      updatedAt: new Date()
    })
    .where(eq(statement.id, row.id));

  return NextResponse.json({ ok: true });
}
