import { and, eq, ne } from "drizzle-orm";
import { ReviewGrid } from "@/components/dashboard/review-grid";
import { db } from "@/lib/db";
import { tallyMaster, statement, company } from "@vouchr/db";
import { getStatementEntries } from "@/lib/r2";
import { notFound } from "next/navigation";
import type { StatementEntry } from "@vouchr/contracts";

const CANONICAL_VOUCHERS = ["Payment", "Receipt", "Contra"] as const;
const BANK_PARENT = "Bank Accounts";

export default async function ReviewPage({
  params
}: {
  params: Promise<{ companyId: string; statementId: string }>;
}) {
  const { companyId, statementId } = await params;

  const statementEntity = await db.query.statement.findFirst({
    where: and(eq(statement.id, statementId), eq(statement.companyId, companyId))
  });

  if (!statementEntity) return notFound();

  const companyEntity = await db.query.company.findFirst({
    where: eq(company.id, companyId)
  });

  const nonBankLedgers = await db
    .select({ name: tallyMaster.name })
    .from(tallyMaster)
    .where(
      and(
        eq(tallyMaster.companyId, companyId),
        eq(tallyMaster.type, "LEDGER"),
        eq(tallyMaster.isActive, true),
        ne(tallyMaster.sourceParent, BANK_PARENT)
      )
    );

  const fallbackWhere = statementEntity.bankLedgerName
    ? and(
        eq(tallyMaster.companyId, companyId),
        eq(tallyMaster.type, "LEDGER"),
        eq(tallyMaster.isActive, true),
        ne(tallyMaster.name, statementEntity.bankLedgerName)
      )
    : and(eq(tallyMaster.companyId, companyId), eq(tallyMaster.type, "LEDGER"), eq(tallyMaster.isActive, true));

  const counterpartyLedgers =
    nonBankLedgers.length > 0
      ? nonBankLedgers
      : await db.select({ name: tallyMaster.name }).from(tallyMaster).where(fallbackWhere);

  const voucherRows = await db
    .select({ name: tallyMaster.name })
    .from(tallyMaster)
    .where(and(eq(tallyMaster.companyId, companyId), eq(tallyMaster.type, "VOUCHER_TYPE"), eq(tallyMaster.isActive, true)));

  const normalized = (s: string) => s.trim().toUpperCase();
  const matched = CANONICAL_VOUCHERS.filter((c) =>
    voucherRows.some((v: { name: string }) => normalized(v.name) === normalized(c))
  );
  const voucherTypes = matched.length > 0 ? [...matched] : [...CANONICAL_VOUCHERS];

  let entries: StatementEntry[] = [];
  if (statementEntity.resultR2Key) {
    try {
      const result = await getStatementEntries(statementEntity.resultR2Key);
      entries = Array.isArray(result?.entries) ? (result.entries as StatementEntry[]) : [];
    } catch {
      entries = [];
    }
  }

  const ledgerNames = counterpartyLedgers.map((item: { name: string }) => item.name);

  return (
    <ReviewGrid
      companyId={companyId}
      statementId={statementId}
      bankLedgerName={statementEntity.bankLedgerName}
      companyName={companyEntity?.tallyCompanyName || companyEntity?.name || ""}
      tallyRemoteId={companyEntity?.tallyCompanyRemoteId || ""}
      entries={entries}
      ledgers={ledgerNames}
      voucherTypes={voucherTypes}
    />
  );
}
