import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getCompanyForOrg, resolveSessionOrg } from "@/lib/org-context";
import { statement } from "@vouchr/db";

const bodySchema = z.object({
  filePassword: z.string().optional()
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const env = getEnv();

  const ctx = await resolveSessionOrg();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let filePassword: string | undefined;
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success) {
      filePassword = parsed.data.filePassword;
    }
  } catch {
    /* empty body */
  }

  console.log(`[api/process] Processing trigger for statementId: ${statementId}`);

  const statementEntity = await db.query.statement.findFirst({ where: eq(statement.id, statementId) });
  if (!statementEntity) {
    console.error(`[api/process] Statement ${statementId} not found in DB`);
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const companyEntity = await getCompanyForOrg(statementEntity.companyId, ctx.orgId);
  if (!companyEntity) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (statementEntity.status === "PROCESSING") {
    return NextResponse.json({ error: "Already processing" }, { status: 409 });
  }

  if (statementEntity.status !== "UPLOADED" && statementEntity.status !== "FAILED" && statementEntity.status !== "ARCHIVED") {
    return NextResponse.json({ error: "Statement cannot be processed in this state" }, { status: 400 });
  }

  const extractionPeriodTo = statementEntity.extractionPeriodTo || todayIso();

  if (!statementEntity.extractionPeriodTo) {
    await db
      .update(statement)
      .set({
        extractionPeriodTo,
        updatedAt: new Date()
      })
      .where(eq(statement.id, statementId));
  }

  if (statementEntity.passwordProtected && !filePassword?.trim()) {
    return NextResponse.json({ error: "PDF password is required for this file" }, { status: 400 });
  }

  console.log(`[api/process] Found statement ${statementId}. Updating status to PROCESSING...`);
  await db
    .update(statement)
    .set({
      status: "PROCESSING",
      updatedAt: new Date()
    })
    .where(eq(statement.id, statementId));

  const workerUrl = `${env.WORKER_BASE_URL}/v1/process-statement`;
  console.log(`[api/process] Forwarding to Python worker at: ${workerUrl}`);

  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      statement_id: statementEntity.id,
      company_id: statementEntity.companyId,
      filename: statementEntity.filename,
      source_r2_key: statementEntity.sourceR2Key,
      bank_ledger_name: statementEntity.bankLedgerName,
      extraction_period_from: statementEntity.extractionPeriodFrom,
      extraction_period_to: extractionPeriodTo,
      file_password: filePassword?.trim() || null
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[api/process] Python worker FAILED (${response.status}): ${errorText}`);
    await db
      .update(statement)
      .set({
        status: "FAILED",
        processingError: `Worker trigger failed (${response.status})`,
        updatedAt: new Date()
      })
      .where(eq(statement.id, statementEntity.id));

    return NextResponse.json({ error: "Failed to trigger worker" }, { status: 500 });
  }

  console.log(`[api/process] Worker accepted the job for statement ${statementId}`);
  return NextResponse.json({ ok: true });
}
