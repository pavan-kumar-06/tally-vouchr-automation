import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statement } from "@vouchr/db";
import { eq } from "drizzle-orm";
import { getStatementEntries, saveStatementEntries } from "@/lib/r2";

export async function GET(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;

  const statementEntity = await db.query.statement.findFirst({
    where: eq(statement.id, statementId),
  });

  if (!statementEntity || !statementEntity.resultR2Key) {
    return NextResponse.json({ error: "Result not ready" }, { status: 404 });
  }

  try {
    const data = await getStatementEntries(statementEntity.resultR2Key);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch from R2" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const body = await request.json();
  const { entries, extractionModel } = body as { entries: unknown[]; extractionModel?: string };

  const statementEntity = await db.query.statement.findFirst({
    where: eq(statement.id, statementId),
  });

  if (!statementEntity || !statementEntity.resultR2Key) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  // Fetch existing statement JSON from R2 to preserve metadata
  const existing = await getStatementEntries(statementEntity.resultR2Key);

  const updated = {
    ...existing,
    extraction_model: extractionModel ?? existing?.extraction_model ?? "manual-review",
    extracted_at: existing?.extracted_at ?? new Date().toISOString(),
    entries
  };

  await saveStatementEntries(statementEntity.resultR2Key, updated);

  return NextResponse.json({ ok: true });
}
