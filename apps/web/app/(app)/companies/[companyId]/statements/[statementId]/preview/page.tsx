import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatementPreviewActions } from "@/components/dashboard/statement-preview-actions";
import { db } from "@/lib/db";
import { statement } from "@vouchr/db";

export default async function StatementPreviewPage({
  params
}: {
  params: Promise<{ companyId: string; statementId: string }>;
}) {
  const { companyId, statementId } = await params;

  const row = await db.query.statement.findFirst({
    where: and(eq(statement.id, statementId), eq(statement.companyId, companyId))
  });

  if (!row) return notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Preview</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Ready to extract</h1>
        <p className="mt-2 text-sm text-slate-600">
          Confirm details below, then start AI extraction. You can review and map ledgers on the next screen.
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">File</dt>
            <dd className="text-right font-medium text-slate-900">{row.filename}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Bank ledger</dt>
            <dd className="text-right font-medium text-slate-900">{row.bankLedgerName || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Extraction period</dt>
            <dd className="text-right text-slate-800">
              {row.extractionPeriodFrom && row.extractionPeriodTo
                ? `${row.extractionPeriodFrom} → ${row.extractionPeriodTo}`
                : "Full statement"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Password protected</dt>
            <dd className="text-right text-slate-800">{row.passwordProtected ? "Yes" : "No"}</dd>
          </div>
        </dl>

        <StatementPreviewActions
          companyId={companyId}
          statementId={statementId}
          status={row.status}
          passwordProtected={row.passwordProtected}
        />

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href={`/companies/${companyId}/banking`} className="text-brand-600 hover:underline">
            Back to banking
          </Link>
        </p>
      </div>
    </div>
  );
}
