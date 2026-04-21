import { db } from "@/lib/db";
import { statement } from "@vouchr/db";
import { desc, eq } from "drizzle-orm";
import { BankingUploadTable } from "@/components/dashboard/banking-upload-table";

export default async function BankingPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const statements = await db.query.statement.findMany({
    where: eq(statement.companyId, companyId),
    orderBy: [desc(statement.createdAt)],
  });

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Banking Statements</h1>
            <p className="text-sm text-slate-500">Manage uploads for Company ID: {companyId}</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {statements.length} Documents
            </span>
          </div>
        </div>
      </header>
      
      <BankingUploadTable 
        companyId={companyId} 
        initialStatements={JSON.parse(JSON.stringify(statements))} 
      />
    </div>
  );
}
