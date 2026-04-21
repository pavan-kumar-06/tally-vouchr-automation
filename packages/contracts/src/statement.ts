import { z } from "zod";

export const debitCreditSchema = z.enum(["DEBIT", "CREDIT"]);

export const voucherTypeSchema = z.enum(["Payment", "Receipt", "Contra"]);

export const statementEntrySchema = z.object({
  row_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narration: z.string().min(1),
  amount: z.number().positive(),
  type: debitCreditSchema,
  voucher_type: voucherTypeSchema,
  is_contra: z.boolean().default(false),
  ledger_name: z.string().nullable().optional(),
  excluded: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  raw_reference: z.string().optional()
});

export const statementJsonSchema = z.object({
  statement_id: z.string().min(1),
  company_id: z.string().min(1),
  source_file_name: z.string().min(1),
  bank_ledger_name: z.string().optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currency: z.string().default("INR"),
  extraction_model: z.string(),
  extracted_at: z.string().datetime(),
  entries: z.array(statementEntrySchema)
});

export type StatementEntry = z.infer<typeof statementEntrySchema>;
export type StatementJson = z.infer<typeof statementJsonSchema>;
