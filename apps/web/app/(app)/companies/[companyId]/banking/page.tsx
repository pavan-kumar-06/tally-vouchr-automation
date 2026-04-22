import { BankingUploadTable } from "@/components/dashboard/banking-upload-table";
import { getEnv } from "@/lib/env";
import { cookies } from "next/headers";

export default async function BankingPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const env = getEnv();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [statementsRes, companyRes] = await Promise.all([
    fetch(`${env.WORKER_BASE_URL}/api/companies/${companyId}/statements`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store"
    }),
    fetch(`${env.WORKER_BASE_URL}/api/companies/${companyId}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store"
    })
  ]);

  if (statementsRes.status === 401 || companyRes.status === 401) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }

  if (!statementsRes.ok || !companyRes.ok) {
    throw new Error(`Failed to load data: ${statementsRes.statusText || companyRes.statusText}`);
  }

  const [statements, company] = await Promise.all([
    statementsRes.json(),
    companyRes.json()
  ]);

  const activeCount = statements.filter((s: any) => s.status !== "ARCHIVED" && s.status !== "DELETED").length;
  const archivedCount = statements.filter((s: any) => s.status === "ARCHIVED").length;
  const companyName = company.tallyCompanyName || company.name || companyId;


  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{companyName}</h1>
            <p className="text-sm text-slate-500">Banking Statements & Uploads</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 border border-blue-100">
              {activeCount} Active
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
              {archivedCount} Archived
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
