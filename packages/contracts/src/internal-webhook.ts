import { z } from "zod";

export const workerProcessedStatementPayloadSchema = z.object({
  statementId: z.string().min(1),
  resultR2Key: z.string().min(1),
  entryCount: z.number().int().nonnegative(),
  status: z.enum(["REVIEW", "FAILED"]),
  processingError: z.string().nullable().optional()
});

export type WorkerProcessedStatementPayload = z.infer<typeof workerProcessedStatementPayloadSchema>;
