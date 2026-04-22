"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatementUploader } from "./statement-uploader";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api-client";
import type { statement } from "@vouchr/db";

type Statement = typeof statement.$inferSelect;

interface BankingUploadTableProps {
  companyId: string;
  initialStatements: Statement[];
}

const PAGE_SIZE = 20;

export function BankingUploadTable({ companyId, initialStatements }: BankingUploadTableProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);
  const router = useRouter();

  const activeRows = initialStatements.filter((row) => row.status !== "ARCHIVED" && row.status !== "DELETED");
  const archivedRows = initialStatements.filter((row) => row.status === "ARCHIVED");

  // Pagination
  const currentRows = activeTab === "active" ? activeRows : archivedRows;
  const totalPages = Math.max(1, Math.ceil(currentRows.length / PAGE_SIZE));
  const pageRows = currentRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when tab changes
  const handleTabChange = (tab: "active" | "archived") => {
    setActiveTab(tab);
    setPage(1);
  };

  async function archiveStatement(statementId: string, archived: boolean) {
    if (busyId) return;
    setBusyId(statementId);
    try {
      await api.archiveStatement(statementId, archived);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStatement(statementId: string) {
    toast("Are you sure you want to permanently delete this statement?", {
      action: {
        label: "Delete",
        onClick: () => doDelete(statementId)
      },
      duration: 5000
    });
  }

  async function doDelete(statementId: string) {
    if (busyId) return;
    setBusyId(statementId);
    try {
      await api.deleteStatement(statementId);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reprocessStatement(statementId: string) {
    if (busyId) return;
    setBusyId(statementId);
    try {
      await api.processStatement(statementId);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardContent className="space-y-4 p-5">
        <StatementUploader companyId={companyId} />

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          <button
            onClick={() => handleTabChange("active")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "active"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Active Statements ({activeRows.length})
          </button>
          <button
            onClick={() => handleTabChange("archived")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "archived"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Archived ({archivedRows.length})
          </button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white">
          {/* Table Header */}
          <div
            className="grid border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
            style={{
              gridTemplateColumns: "1fr 140px 160px 160px 80px 120px 100px 80px"
            }}
          >
            <div>File Name</div>
            <div>Upload Date</div>
            <div>Bank Ledger</div>
            <div>Period</div>
            <div>Entries</div>
            <div>Status</div>
            <div className="text-center">Actions</div>
            <div className="text-center">Delete</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-slate-400 text-sm">
                No statements to display.
              </div>
            ) : (
              pageRows.map((row) => (
                <div
                  key={row.id}
                  className="grid items-center px-4 py-3 text-sm hover:bg-slate-50/50 transition-colors"
                  style={{
                    gridTemplateColumns: "1fr 140px 160px 160px 80px 120px 100px 80px"
                  }}
                >
                  <div className="font-medium text-slate-900 truncate pr-4" title={row.filename}>
                    {row.filename}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {format(new Date(row.createdAt), "dd-MM-yyyy HH:mm")}
                  </div>
                  <div className="text-slate-600 text-xs truncate pr-2">
                    {row.bankLedgerName || "Auto-detected"}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {row.extractionPeriodFrom && row.extractionPeriodTo
                      ? `${row.extractionPeriodFrom} - ${row.extractionPeriodTo}`
                      : "Full Statement"}
                  </div>
                  <div className="text-slate-700 font-semibold text-xs">
                    {row.entryCount > 0 ? row.entryCount : "-"}
                  </div>
                  <div className="flex items-center">
                    {renderStatusAction(row, companyId, busyId === row.id, () => void reprocessStatement(row.id))}
                  </div>
                  <div className="flex items-center justify-center gap-1">
                    {activeTab === "active" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={busyId === row.id || row.status === "PROCESSING"}
                        onClick={() => void archiveStatement(row.id, true)}
                      >
                        Archive
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          disabled={busyId === row.id}
                          onClick={() => void archiveStatement(row.id, false)}
                        >
                          Restore
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => void deleteStatement(row.id)}
                      disabled={busyId === row.id || row.status === "PROCESSING"}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-30"
                      title="Delete statement"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <div className="text-xs text-slate-500">
              Showing {currentRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, currentRows.length)} of {currentRows.length}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) {
                  p = i + 1;
                } else if (page <= 3) {
                  p = i + 1;
                } else if (page >= totalPages - 2) {
                  p = totalPages - 4 + i;
                } else {
                  p = page - 2 + i;
                }
                return (
                  <button
                    key={`page-${p}`}
                    onClick={() => setPage(p)}
                    className={`h-7 w-7 rounded text-xs font-medium ${
                      page === p ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function renderStatusAction(row: Statement, companyId: string, busy: boolean, onReprocess: () => void) {
  switch (row.status) {
    case "UPLOADED":
      return (
        <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-7 px-2 text-xs" disabled={busy} onClick={onReprocess}>
          Process
        </Button>
      );
    case "PROCESSING":
      return (
        <Badge tone="warning" className="bg-amber-50 text-amber-700 border-amber-100 animate-pulse text-xs">
          Processing...
        </Badge>
      );
    case "REVIEW":
      return (
        <Link href={`/companies/${companyId}/statements/${row.id}/review`}>
          <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-7 px-2 text-xs">
            Review
          </Button>
        </Link>
      );
    case "SYNCED":
      return <Badge tone="success" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-xs">Synced</Badge>;
    case "FAILED":
      return (
        <div className="flex items-center gap-1">
          <Badge tone="warning" className="bg-red-50 text-red-700 border-red-100 text-xs">Failed</Badge>
          <Button size="sm" variant="secondary" className="h-6 px-1.5 text-xs" disabled={busy} onClick={onReprocess}>
            Retry
          </Button>
        </div>
      );
    default:
      return null;
  }
}
