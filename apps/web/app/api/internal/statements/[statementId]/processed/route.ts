import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { statement } from "@vouchr/db";
import { workerProcessedStatementPayloadSchema } from "@vouchr/contracts";
import { getEnv } from "@/lib/env";

export async function POST(request: Request, { params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const env = getEnv();

  console.log(`[api/internal/processed] Received callback for ${statementId}`);

  const secret = request.headers.get("x-worker-secret");
  if (secret !== env.WORKER_WEBHOOK_SECRET) {
    console.error(`[api/internal/processed] Unauthorized webhook attempt for ${statementId}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = workerProcessedStatementPayloadSchema.parse(await request.json());

  if (payload.statementId !== statementId) {
    console.error(`[api/internal/processed] Statement mismatch: URL=${statementId}, Body=${payload.statementId}`);
    return NextResponse.json({ error: "Statement mismatch" }, { status: 400 });
  }

  console.log(`[api/internal/processed] Updating DB for ${statementId}: status=${payload.status}, entries=${payload.entryCount}`);

  await db
    .update(statement)
    .set({
      resultR2Key: payload.resultR2Key,
      entryCount: payload.entryCount,
      status: payload.status,
      processingError: payload.processingError ?? null,
      updatedAt: new Date()
    })
    .where(eq(statement.id, statementId));

  console.log(`[api/internal/processed] DB updated successfully for ${statementId}`);
  return NextResponse.json({ ok: true });
}
