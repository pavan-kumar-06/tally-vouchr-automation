import { ReviewGrid } from "@/components/dashboard/review-grid";
import { notFound } from "next/navigation";
import { getEnv } from "@/lib/env";
import { cookies } from "next/headers";

export default async function ReviewPage({
  params
}: {
  params: Promise<{ companyId: string; statementId: string }>;
}) {
  const { companyId, statementId } = await params;
  const env = getEnv();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${env.WORKER_BASE_URL}/api/statements/${statementId}/review-context`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store"
  });

  if (!res.ok) {
    if (res.status === 401) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
    if (res.status === 404) return notFound();
    throw new Error(`Failed to load review context: ${res.statusText}`);
  }

  const data = await res.json();

  return (
    <ReviewGrid
      companyId={companyId}
      statementId={statementId}
      bankLedgerName={data.statement?.bankLedgerName}
      filename={data.statement?.filename}
      status={data.statement?.status}
      companyName={data.companyName || ""}
      tallyRemoteId={data.tallyRemoteId || ""}
      entries={data.entries || []}
      ledgers={data.ledgers || []}
      voucherTypes={data.voucherTypes || []}
    />
  );
}
