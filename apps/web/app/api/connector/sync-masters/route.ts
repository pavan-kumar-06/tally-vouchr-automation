import { NextResponse } from "next/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { company, tallyMaster } from "@vouchr/db";
import { getEnv } from "@/lib/env";

const requestSchema = z.object({
  organizationId: z.string().min(1),
  tallyCompanyRemoteId: z.string().min(1),
  masters: z.array(
    z
      .object({
        name: z.string().min(1),
        type: z.enum(["LEDGER", "VOUCHER_TYPE"]),
        /** BANK = bank account ledgers; OTHER = income/expense/cash/etc. Omit for voucher types. */
        ledgerKind: z.enum(["BANK", "OTHER"]).optional(),
        parent: z.string().optional(),
        isDeemedPositive: z.boolean().optional()
      })
      .superRefine((row, ctx) => {
        if (row.type === "VOUCHER_TYPE" && row.ledgerKind != null) {
          ctx.addIssue({ code: "custom", message: "ledgerKind must be omitted for VOUCHER_TYPE" });
        }
      })
  )
});

function normalizeName(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function cleanTallyText(value?: string) {
  if (!value) return null;
  // Remove non-printable/control characters that Tally can emit (e.g. &#4; Primary).
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim();
  return cleaned || null;
}

function classifyLedgerKind(master: { type: "LEDGER" | "VOUCHER_TYPE"; ledgerKind?: "BANK" | "OTHER"; parent?: string }) {
  if (master.type !== "LEDGER") return null;
  if (master.ledgerKind) return master.ledgerKind;
  const parent = cleanTallyText(master.parent)?.toUpperCase();
  if (parent === "BANK ACCOUNTS") return "BANK";
  return "OTHER";
}

export async function POST(request: Request) {
  const env = getEnv();
  const connectorToken = request.headers.get("x-connector-token");
  if (connectorToken !== env.CONNECTOR_SHARED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized connector" }, { status: 401 });
  }

  const body = requestSchema.parse(await request.json());
  
  if (body.masters.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Find the mapped Vouchr company
  // LOCAL MODE: connector sends 'desktop-local' as orgId, but DB has real UUID.
  // So we just look up by tallyCompanyRemoteId only.
  const companyEntity = await db.query.company.findFirst({ 
    where: eq(company.tallyCompanyRemoteId, body.tallyCompanyRemoteId)
  });

  if (!companyEntity) {
    console.log(`[sync-masters] 404 - No company found for remoteId: ${body.tallyCompanyRemoteId}`);
    return NextResponse.json({ error: "No mapped company found for this Tally ID" }, { status: 404 });
  }

  console.log(`[sync-masters] Found company: ${companyEntity.name} (${companyEntity.id}). Upserting ${body.masters.length} masters...`);


  const now = new Date();

  await Promise.all(
    body.masters.map((master) =>
      db
        .insert(tallyMaster)
        .values({
          id: `tm_${crypto.randomUUID().replaceAll("-", "")}`,
          companyId: companyEntity.id,
          type: master.type,
          name: master.name,
          normalizedName: normalizeName(master.name),
          ledgerKind: classifyLedgerKind(master),
          sourceParent: master.type === "LEDGER" ? cleanTallyText(master.parent) : null,
          sourceIsDeemedPositive: master.type === "LEDGER" ? (master.isDeemedPositive ?? null) : null,
          sourceUpdatedAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [tallyMaster.companyId, tallyMaster.type, tallyMaster.normalizedName],
          set: {
            name: master.name,
            ledgerKind: classifyLedgerKind(master),
            sourceParent: master.type === "LEDGER" ? cleanTallyText(master.parent) : null,
            sourceIsDeemedPositive: master.type === "LEDGER" ? (master.isDeemedPositive ?? null) : null,
            isActive: true,
            sourceUpdatedAt: now,
            updatedAt: now
          }
        })
    )
  );

  await db
    .update(tallyMaster)
    .set({ isActive: false, updatedAt: now })
    .where(
      and(
        eq(tallyMaster.companyId, companyEntity.id),
        or(isNull(tallyMaster.sourceUpdatedAt), lt(tallyMaster.sourceUpdatedAt, now))
      )
    );

  await db
    .update(company)
    .set({ connectorLastSyncedAt: now, updatedAt: now })
    .where(eq(company.id, companyEntity.id));

  console.log(`[Vouchr BE] Successfully synced ${body.masters.length} masters for company: ${companyEntity.name} (ID: ${companyEntity.tallyCompanyRemoteId})`);

  return NextResponse.json({ ok: true, count: body.masters.length });
}
