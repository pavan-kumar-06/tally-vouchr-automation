"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { createStatementUploadUrl } from "@/lib/r2";
import { company, statement } from "@vouchr/db";

const inputSchema = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().default("application/pdf"),
  bankLedgerName: z.string().optional(),
  extractionPeriodFrom: z.string().optional(),
  extractionPeriodTo: z.string().optional(),
  passwordProtected: z.boolean().default(false)
});

export async function createStatementUploadAction(input: z.infer<typeof inputSchema>) {
  const body = inputSchema.parse(input);

  const companyExists = await db.query.company.findFirst({
    where: and(eq(company.id, body.companyId), eq(company.ownerId, body.userId))
  });

  if (!companyExists) {
    throw new Error("Company not found");
  }

  const statementId = `stmt_${crypto.randomUUID().replaceAll("-", "")}`;
  const ext = body.filename.split(".").pop()?.toLowerCase() ?? "pdf";
  const sourceR2Key = `statements/${body.companyId}/${statementId}/source.${ext}`;

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

  const uploadUrl = await createStatementUploadUrl({
    key: sourceR2Key,
    contentType: body.contentType
  });

  return {
    statementId,
    sourceR2Key,
    uploadUrl
  };
}
