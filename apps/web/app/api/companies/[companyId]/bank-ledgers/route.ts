import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tallyMaster } from "@vouchr/db";
import { getCompanyForOrg, resolveSessionOrg } from "@/lib/org-context";

const BANK_PARENT = "Bank Accounts";

export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await resolveSessionOrg();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  const companyEntity = await getCompanyForOrg(companyId, ctx.orgId);
  if (!companyEntity) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const bankLedgers = await db
    .select({ name: tallyMaster.name })
    .from(tallyMaster)
    .where(
      and(
        eq(tallyMaster.companyId, companyId),
        eq(tallyMaster.type, "LEDGER"),
        eq(tallyMaster.isActive, true),
        eq(tallyMaster.sourceParent, BANK_PARENT)
      )
    )
    .orderBy(asc(tallyMaster.name));

  if (bankLedgers.length > 0) {
    return NextResponse.json({
      names: bankLedgers.map((r: { name: string }) => r.name),
      source: "BANK_PARENT" as const
    });
  }

  const fallback = await db
    .select({ name: tallyMaster.name })
    .from(tallyMaster)
    .where(
      and(
        eq(tallyMaster.companyId, companyId),
        eq(tallyMaster.type, "LEDGER"),
        eq(tallyMaster.isActive, true)
      )
    )
    .orderBy(asc(tallyMaster.name))
    .limit(500);

  return NextResponse.json({
    names: fallback.map((r: { name: string }) => r.name),
    source: "ALL_UNTAGGED" as const
  });
}
