import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { company, statement } from "@vouchr/db";
import { and, eq } from "drizzle-orm";
import { createStatementUploadUrl } from "@/lib/r2";

const requestSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().default("application/pdf"),
  bankLedgerName: z.string().optional(),
  extractionPeriodFrom: z.string().optional(),
  extractionPeriodTo: z.string().optional(),
  passwordProtected: z.boolean().default(false)
});

export async function POST(request: Request) {
  console.log("[api/upload-url] Incoming request...");
  const body = requestSchema.parse(await request.json());
  console.log(`[api/upload-url] Request for companyId: ${body.companyId}, filename: ${body.filename}`);

  const companyExists = await db.query.company.findFirst({
    where: and(eq(company.id, body.companyId), eq(company.ownerId, body.userId))
  });

  if (!companyExists) {
    console.error(`[api/upload-url] Company not found or unauthorized: ${body.companyId}`);
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const statementId = `stmt_${crypto.randomUUID().replaceAll("-", "")}`;
  const ext = body.filename.split(".").pop()?.toLowerCase() ?? "pdf";
  const sourceR2Key = `statements/${body.companyId}/${statementId}/source.${ext}`;

  console.log(`[api/upload-url] Generated statementId: ${statementId}, R2 key: ${sourceR2Key}`);

  await db.insert(statement).values({
    id: statementId,
    companyId: body.companyId,
    uploadedByUserId: body.userId,
    filename: body.filename,
    sourceR2Key,
    bankLedgerName: body.bankLedgerName,
    extractionPeriodFrom: body.extractionPeriodFrom,
    extractionPeriodTo: body.extractionPeriodTo,
    passwordProtected: body.passwordProtected,
    status: "UPLOADED"
  });

  console.log("[api/upload-url] Created statement record in DB. Generating presigned URL...");

  const uploadUrl = await createStatementUploadUrl({
    key: sourceR2Key,
    contentType: body.contentType
  });

  console.log("[api/upload-url] Presigned URL generated successfully.");

  return NextResponse.json({
    statementId,
    sourceR2Key,
    uploadUrl
  });
}
