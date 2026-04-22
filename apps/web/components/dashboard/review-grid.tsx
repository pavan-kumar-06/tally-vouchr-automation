"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Search,
  Trash2,
  X,
  FileSpreadsheet,
  FileCode,
  Edit2,
  Check,
  Calendar,
  FileText
} from "lucide-react";
import type { StatementEntry } from "@vouchr/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toRupee } from "@/lib/utils";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { SearchableSelect } from "./searchable-select";
import { api } from "@/lib/api-client";

type Props = {
  companyId: string;
  statementId: string;
  entries: StatementEntry[];
  ledgers: string[];
  bankLedgerName?: string | null;
  filename?: string | null;
  status?: string | null;
  companyName?: string;
  tallyRemoteId?: string;
  voucherTypes?: readonly string[];
};

const DEFAULT_VOUCHERS = ["Payment", "Receipt", "Contra"] as const;
const PAGE_SIZE = 15;

type FilterState = {
  drCrFilter: "ALL" | "DEBIT" | "CREDIT";
  statusFilter: "ALL" | "PENDING" | "RESOLVED";
  ledgerFilter: string;
  voucherFilter: string;
  dateFrom: string;
  dateTo: string;
  narrationFilter: string;
  amountFilter: string;
};

type SortState = {
  field: "date" | "amount" | "narration" | null;
  dir: "asc" | "desc";
};

type RowState = {
  entries: StatementEntry[];
  excluded: Set<string>;
  ledgerMap: Record<string, string>;
  voucherMap: Record<string, StatementEntry["voucher_type"]>;
};

type State = {
  filter: FilterState;
  sort: SortState;
  page: number;
  selected: Set<string>;
  bulkLedger: string;
  saving: boolean;
  rows: RowState;
  dirty: boolean;
  initialized: boolean;
};

type Action =
  | { type: "INIT"; entries: StatementEntry[] }
  | { type: "SET_FILTER"; filter: Partial<FilterState>; autoSelect?: boolean }
  | { type: "CLEAR_FILTERS" }
  | { type: "SET_SORT"; field: SortState["field"] }
  | { type: "SET_PAGE"; page: number }
  | { type: "TOGGLE_SELECT"; id: string }
  | { type: "SELECT_ALL"; ids: string[] }
  | { type: "DESELECT_ALL" }
  | { type: "SET_BULK_LEDGER"; ledger: string }
  | { type: "APPLY_BULK_LEDGER" }
  | { type: "DELETE_ONE"; id: string }
  | { type: "UPDATE_LEDGER"; id: string; ledger: string }
  | { type: "UPDATE_VOUCHER"; id: string; voucher: StatementEntry["voucher_type"] }
  | { type: "SET_SAVING"; saving: boolean }
  | { type: "MARK_CLEAN" }
  | { type: "RESET" }
  | { type: "UPDATE_BANK_LEDGER"; name: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT": {
      const ledgerMap: Record<string, string> = {};
      const voucherMap: Record<string, StatementEntry["voucher_type"]> = {};
      const excluded = new Set<string>();
      action.entries.forEach((e) => {
        ledgerMap[e.row_id] = e.ledger_name ?? "";
        voucherMap[e.row_id] = e.voucher_type;
        if (e.excluded) excluded.add(e.row_id);
      });
      return {
        ...state,
        rows: { entries: action.entries, excluded, ledgerMap, voucherMap },
        dirty: false,
        initialized: true
      };
    }

    case "SET_FILTER": {
      const newFilter = { ...state.filter, ...action.filter };
      const autoSelect = action.autoSelect !== false;

      if (!autoSelect) {
        return {
          ...state,
          filter: newFilter,
          page: 1
        };
      }

      // Select only the first page's visible rows when filter changes (user requested page-based selection)
      const sortedRows = getFilteredSorted(
        state.rows.entries,
        state.rows.excluded,
        state.rows.ledgerMap,
        state.rows.voucherMap,
        newFilter,
        state.sort
      );
      const visibleIds = sortedRows.slice(0, PAGE_SIZE).map((e) => e.row_id);

      return {
        ...state,
        filter: newFilter,
        page: 1,
        selected: new Set(visibleIds)
      };
    }

    case "CLEAR_FILTERS":
      return {
        ...state,
        filter: { drCrFilter: "ALL", statusFilter: "ALL", ledgerFilter: "", voucherFilter: "", dateFrom: "", dateTo: "", narrationFilter: "", amountFilter: "" },
        page: 1,
        selected: new Set()
      };

    case "SET_SORT":
      if (state.sort.field === action.field) {
        return { ...state, sort: { ...state.sort, dir: state.sort.dir === "asc" ? "desc" : "asc" } };
      }
      return { ...state, sort: { field: action.field, dir: "asc" }, page: 1 };

    case "SET_PAGE":
      return { ...state, page: action.page };

    case "TOGGLE_SELECT": {
      const next = new Set(state.selected);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, selected: next };
    }

    case "SELECT_ALL":
      return { ...state, selected: new Set(action.ids) };

    case "DESELECT_ALL":
      return { ...state, selected: new Set() };

    case "SET_BULK_LEDGER":
      return { ...state, bulkLedger: action.ledger };

    case "APPLY_BULK_LEDGER": {
      if (!state.bulkLedger || state.selected.size === 0) return state;
      const ledgerMap = { ...state.rows.ledgerMap };
      state.selected.forEach((id) => { ledgerMap[id] = state.bulkLedger; });
      return { ...state, rows: { ...state.rows, ledgerMap }, selected: new Set(), bulkLedger: "", dirty: true };
    }

    case "DELETE_ONE": {
      const excluded = new Set(state.rows.excluded);
      excluded.add(action.id);
      const selected = new Set(state.selected);
      selected.delete(action.id);
      return { ...state, rows: { ...state.rows, excluded }, selected, dirty: true };
    }

    case "UPDATE_LEDGER": {
      const ledgerMap = { ...state.rows.ledgerMap };
      ledgerMap[action.id] = action.ledger;
      return { ...state, rows: { ...state.rows, ledgerMap }, dirty: true };
    }

    case "UPDATE_VOUCHER": {
      const voucherMap = { ...state.rows.voucherMap };
      voucherMap[action.id] = action.voucher;
      return { ...state, rows: { ...state.rows, voucherMap }, dirty: true };
    }

    case "SET_SAVING":
      return { ...state, saving: action.saving };

    case "MARK_CLEAN":
      return { ...state, dirty: false };

    case "UPDATE_BANK_LEDGER":
      return { ...state, dirty: true };

    case "RESET":
      return {
        ...state,
        rows: {
          entries: state.rows.entries,
          excluded: new Set(),
          ledgerMap: Object.fromEntries(state.rows.entries.map((e) => [e.row_id, e.ledger_name ?? ""])),
          voucherMap: Object.fromEntries(state.rows.entries.map((e) => [e.row_id, e.voucher_type]))
        },
        selected: new Set(),
        bulkLedger: "",
        dirty: false
      };

    default:
      return state;
  }
}

function DonutChart({ percent, size = 60 }: { percent: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          className="text-slate-100"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          className="text-emerald-500 transition-all duration-500 ease-in-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-[10px] font-bold text-slate-700">
        {Math.round(percent)}%
      </div>
    </div>
  );
}

function getFilteredSorted(
  entries: StatementEntry[],
  excluded: Set<string>,
  ledgerMap: Record<string, string>,
  voucherMap: Record<string, StatementEntry["voucher_type"]>,
  filter: FilterState,
  sort: SortState
): StatementEntry[] {
  let rows = entries.filter((e) => !excluded.has(e.row_id));

  if (filter.narrationFilter) {
    const q = filter.narrationFilter.toLowerCase();
    rows = rows.filter((r) => r.narration?.toLowerCase().includes(q));
  }
  if (filter.amountFilter) {
    const q = filter.amountFilter.replace(/[^0-9]/g, "");
    rows = rows.filter((r) => toRupee(r.amount).replace(/[^0-9]/g, "").includes(q));
  }
  if (filter.drCrFilter !== "ALL") {
    rows = rows.filter((r) => r.type === filter.drCrFilter);
  }
  if (filter.voucherFilter) {
    rows = rows.filter((r) => (voucherMap[r.row_id] ?? r.voucher_type) === filter.voucherFilter);
  }
  if (filter.statusFilter === "PENDING") {
    rows = rows.filter((r) => !ledgerMap[r.row_id]);
  } else if (filter.statusFilter === "RESOLVED") {
    rows = rows.filter((r) => !!ledgerMap[r.row_id]);
  }
  if (filter.ledgerFilter) {
    rows = rows.filter((r) => ledgerMap[r.row_id] === filter.ledgerFilter);
  }
  if (filter.dateFrom) rows = rows.filter((r) => r.date >= filter.dateFrom);
  if (filter.dateTo) rows = rows.filter((r) => r.date <= filter.dateTo);

  if (sort.field) {
    rows.sort((a, b) => {
      let cmp = 0;
      if (sort.field === "date") cmp = a.date.localeCompare(b.date);
      else if (sort.field === "amount") cmp = a.amount - b.amount;
      else if (sort.field === "narration") cmp = (a.narration || "").localeCompare(b.narration || "");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }

  return rows;
}

const initialState: State = {
  filter: { drCrFilter: "ALL", statusFilter: "ALL", ledgerFilter: "", voucherFilter: "", dateFrom: "", dateTo: "", narrationFilter: "", amountFilter: "" },
  sort: { field: null, dir: "asc" },
  page: 1,
  selected: new Set(),
  bulkLedger: "",
  saving: false,
  rows: { entries: [], excluded: new Set(), ledgerMap: {}, voucherMap: {} },
  dirty: false,
  initialized: false
};

export function ReviewGrid({ companyId, statementId, entries, ledgers, bankLedgerName: initialBankLedger, filename, status, companyName, tallyRemoteId, voucherTypes = DEFAULT_VOUCHERS }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [exportOpen, setExportOpen] = useState(false);
  const bankLedger = initialBankLedger || "";

  useEffect(() => {
    if (entries && entries.length > 0) {
      dispatch({ type: "INIT", entries });
    }
  }, [entries]);

  // Close export dropdown when clicking outside
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as HTMLElement)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const { filter, sort, page, selected, bulkLedger, saving, rows, dirty, initialized } = state;

  // Show toast when user picks a ledger for bulk update
  const prevBulkLedger = useRef("");
  useEffect(() => {
    if (bulkLedger && bulkLedger !== prevBulkLedger.current) {
      toast.success(`${selected.size} rows will be updated with ledger: ${bulkLedger}`);
    }
    prevBulkLedger.current = bulkLedger;
  }, [bulkLedger, selected.size]);

  // Track excluded rows for toast notification
  const prevExcludedCount = useRef(rows.excluded.size);
  useEffect(() => {
    const curr = rows.excluded.size;
    if (curr > prevExcludedCount.current) {
      toast("Row excluded from export", { description: `${curr - prevExcludedCount.current} row(s) removed` });
    }
    prevExcludedCount.current = curr;
  }, [rows.excluded.size]);

  const processedRows = useMemo(
    () => getFilteredSorted(rows.entries, rows.excluded, rows.ledgerMap, rows.voucherMap, filter, sort),
    [rows, filter, sort]
  );

  const stats = useMemo(() => {
    const total = rows.entries.length;
    const resolved = Object.values(rows.ledgerMap).filter(Boolean).length;
    const pending = total - resolved;
    const percent = total > 0 ? (resolved / total) * 100 : 0;
    
    // Date range
    let dateFrom = "";
    let dateTo = "";
    if (rows.entries.length > 0) {
      const dates = rows.entries.map(e => e.date).sort();
      dateFrom = dates[0] ?? "";
      dateTo = dates[dates.length - 1] ?? "";
    }

    return { total, resolved, pending, percent, dateFrom, dateTo };
  }, [rows]);

  const totalRows = processedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageRows = processedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resolvedCount = useMemo(
    () => processedRows.filter((r) => rows.ledgerMap[r.row_id]).length,
    [processedRows, rows.ledgerMap]
  );
  const pendingCount = totalRows - resolvedCount;
  const excludedCount = rows.excluded.size;

  const hasActiveFilters = filter.drCrFilter !== "ALL" || filter.statusFilter !== "ALL" || filter.ledgerFilter || filter.voucherFilter || filter.dateFrom || filter.dateTo || filter.narrationFilter || filter.amountFilter;

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    dispatch({ type: "SET_SAVING", saving: true });
    try {
      const entriesToSave = rows.entries.map((e) => ({
        ...e,
        ledger_name: rows.ledgerMap[e.row_id] || null,
        voucher_type: rows.voucherMap[e.row_id],
        excluded: rows.excluded.has(e.row_id)
      }));
      await api.putStatementEntries(statementId, entriesToSave, "manual-review");
      toast.success("Changes saved successfully");
      dispatch({ type: "MARK_CLEAN" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      dispatch({ type: "SET_SAVING", saving: false });
    }
  }, [dirty, saving, rows, statementId]);

  const handleExport = useCallback(() => {
    // Export all non-excluded entries with their ledger/voucher mappings
    const rowsToExport = rows.entries
      .filter((e) => !rows.excluded.has(e.row_id))
      .map((e) => ({
        Date: e.date,
        Narration: e.narration || "",
        Amount: e.amount,
        "Dr/Cr": e.type,
        "Voucher Type": rows.voucherMap[e.row_id] || e.voucher_type || "",
        Ledger: rows.ledgerMap[e.row_id] || "",
        Reference: e.raw_reference || "",
      }));

    if (rowsToExport.length === 0) {
      toast.warning("No entries to export");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");

    // Auto-size columns
    const colWidths = [
      { wch: 12 },  // Date
      { wch: 40 },  // Narration
      { wch: 14 },  // Amount
      { wch: 6 },   // Dr/Cr
      { wch: 14 },  // Voucher Type
      { wch: 25 },  // Ledger
      { wch: 20 },  // Reference
    ];
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `bank-entries-${statementId.slice(0, 8)}.xlsx`);
    toast.success(`Exported ${rowsToExport.length} entries to Excel`);
    setExportOpen(false);
  }, [rows, statementId]);

  const handleExportXML = useCallback(() => {
    const entriesToExport = rows.entries
      .filter((e) => !rows.excluded.has(e.row_id))
      .filter((e) => rows.ledgerMap[e.row_id]);

    if (entriesToExport.length === 0) {
      toast.warning("No mapped entries to export. Please map ledgers first.");
      setExportOpen(false);
      return;
    }

    const xmlEntries = entriesToExport.map((e, idx) => {
      const ledger = rows.ledgerMap[e.row_id] as string;
      const voucherType = rows.voucherMap[e.row_id] || e.voucher_type || "Payment";
      const narration = e.narration || "";
      const amount = e.amount;
      // Tally date format: YYYYMMDD
      const dateStr = e.date.replace(/-/g, "");
      const isDebitInStatement = e.type === "DEBIT"; // Money going OUT usually
      const bankLedgerValue = bankLedger || "Bank Account";

      // TALLY SIGN CONVENTION:
      // DEBIT: ISDEEMEDPOSITIVE = Yes, AMOUNT = -ve
      // CREDIT: ISDEEMEDPOSITIVE = No, AMOUNT = +ve

      // For standard bank statement:
      // DEBIT (Money OUT): Bank is CREDITED (+ve), Party is DEBITED (-ve)
      // CREDIT (Money IN): Bank is DEBITED (-ve), Party is CREDITED (+ve)

      const bankIsDeemedPositive = isDebitInStatement ? "No" : "Yes";
      const bankAmount = isDebitInStatement ? amount : -amount;
      const partyIsDeemedPositive = isDebitInStatement ? "Yes" : "No";
      const partyAmount = isDebitInStatement ? -amount : amount;

      const vchNum = `TX${String(idx + 1).padStart(4, "0")}`;

      return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
          <DATE>${dateStr}</DATE>
          <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${vchNum}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(bankLedger)}</PARTYLEDGERNAME>
          <NARRATION>${escapeXml(narration)}</NARRATION>
          <EFFECTIVEDATE>${dateStr}</EFFECTIVEDATE>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(ledger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${partyIsDeemedPositive}</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>No</ISPARTYLEDGER>
            <AMOUNT>${partyAmount.toFixed(2)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(bankLedgerValue)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${bankIsDeemedPositive}</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <AMOUNT>${bankAmount.toFixed(2)}</AMOUNT>
            <BANKALLOCATIONS.LIST>
              <DATE>${dateStr}</DATE>
              <INSTRUMENTDATE>${dateStr}</INSTRUMENTDATE>
              <TRANSACTIONTYPE>Others</TRANSACTIONTYPE>
              <PAYMENTFAVOURING>${escapeXml(ledger)}</PAYMENTFAVOURING>
              <AMOUNT>${bankAmount.toFixed(2)}</AMOUNT>
            </BANKALLOCATIONS.LIST>
          </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName || "")}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${xmlEntries.join("\n")}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tally-vouchers-${statementId.slice(0, 8)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entriesToExport.length} vouchers to Tally XML`);
    setExportOpen(false);
  }, [rows, statementId, bankLedger, companyName]);

  function escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  const pageIds = useMemo(() => pageRows.map((r) => r.row_id), [pageRows]);

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.row_id));
  const somePageSelected = pageRows.some((r) => selected.has(r.row_id));

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <p>Loading transactions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Document Information Card */}
      <Card className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-soft">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-12">
            {/* Left Section: Details */}
            <div className="md:col-span-7 p-6 space-y-4 border-r border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <FileText className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Document Information</span>
              </div>
              
              <div className="grid grid-cols-3 gap-y-4 text-sm">
                <div className="text-slate-500 font-medium">File Name</div>
                <div className="col-span-2 text-slate-900 font-semibold break-all">{filename || "N/A"}</div>

                <div className="text-slate-500 font-medium">Bank Ledger</div>
                <div className="col-span-2">
                  <span className="text-brand-600 font-bold uppercase">{bankLedger || "Not Selected"}</span>
                </div>

                <div className="text-slate-500 font-medium">Date Period</div>
                <div className="col-span-2 text-slate-700 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{stats.dateFrom || "..."} — {stats.dateTo || "..."}</span>
                </div>

                <div className="text-slate-500 font-medium">Status</div>
                <div className="col-span-2">
                  <Badge tone="warning" className="bg-brand-50 text-brand-700 border-brand-100 capitalize">
                    {(status || "REVIEW").toLowerCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Right Section: Stats & Progress */}
            <div className="md:col-span-5 p-6 bg-slate-50/50 flex items-center justify-around">
              <div className="flex-shrink-0">
                <DonutChart percent={stats.percent} size={100} />
              </div>
              
              <div className="space-y-4 min-w-[120px]">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-slate-500 text-sm font-medium">Pending</span>
                    <span className="text-slate-900 font-bold text-lg">{stats.pending}</span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${100 - stats.percent}%` }} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center justify-between gap-8">
                    <span className="text-slate-500 text-sm font-medium">Resolved</span>
                    <span className="text-slate-900 font-bold text-lg">{stats.resolved}</span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${stats.percent}%` }} />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-bold uppercase">Total</span>
                    <span className="text-slate-900 font-bold">{stats.total}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid Controls */}
      <Card className="rounded-xl border-slate-200">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <h1 className="font-heading text-xl font-bold text-slate-900">Review Transactions</h1>
          </div>
          <div className="flex items-center gap-3 relative" ref={exportRef}>
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "RESET" })} disabled={!dirty || saving}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setExportOpen((v) => !v)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden w-52">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                  Export to Excel
                </button>
                <button
                  onClick={handleExportXML}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                >
                  <FileCode className="h-4 w-4 text-blue-600 shrink-0" />
                  Export for Tally XML
                </button>
              </div>
            )}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow-sm transition-all hover:scale-[1.02]" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700" disabled={pendingCount > 0}>
              Send to Tally
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Update Bar - above table when rows selected */}
      {selected.size > 0 && (
        <Card className="rounded-xl border-2 border-brand-400 bg-brand-50 shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <span className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-bold text-white">
              {selected.size} Selected
            </span>
            <div className="flex items-center gap-2">
              <SearchableSelect
                value={bulkLedger}
                onChange={(val) => dispatch({ type: "SET_BULK_LEDGER", ledger: val })}
                options={ledgers}
                placeholder="Select Ledger"
                className="min-w-[220px]"
              />
              <Button
                size="sm"
                className="bg-brand-600 hover:bg-brand-700 h-10 px-6 text-sm font-semibold"
                onClick={() => dispatch({ type: "APPLY_BULK_LEDGER" })}
                disabled={!bulkLedger}
              >
                Update
              </Button>
            </div>
            <button
              onClick={() => dispatch({ type: "DESELECT_ALL" })}
              className="flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-300 transition-colors ml-auto"
            >
              Clear Selection <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
        <CardContent className="p-0">
          {/* Pagination at top */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
            <span className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalRows)}</span> of <span className="font-semibold text-slate-700">{totalRows}</span>
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => dispatch({ type: "SET_PAGE", page: 1 })} disabled={page === 1} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronsLeft className="h-5 w-5" />
              </button>
              <button onClick={() => dispatch({ type: "SET_PAGE", page: Math.max(1, page - 1) })} disabled={page === 1} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={`page-${p}`}
                    onClick={() => dispatch({ type: "SET_PAGE", page: p })}
                    className={`h-8 w-8 rounded text-sm font-medium ${
                      page === p ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button onClick={() => dispatch({ type: "SET_PAGE", page: Math.min(totalPages, page + 1) })} disabled={page === totalPages} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
              <button onClick={() => dispatch({ type: "SET_PAGE", page: totalPages })} disabled={page === totalPages} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronsRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Clear Filters + Table header row */}
          <div className="flex items-center justify-between px-5 py-2 bg-white border-b border-slate-200">
            {hasActiveFilters && (
              <button
                onClick={() => dispatch({ type: "CLEAR_FILTERS" })}
                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Clear Filters
              </button>
            )}
            {!hasActiveFilters && <div />}
          </div>

          {/* Table header */}
          <div className="grid border-b border-slate-200 bg-slate-50 text-sm font-semibold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: "50px 100px 1fr 120px 80px 100px 180px 90px 70px" }}>
            {/* Select All */}
            <div className="flex items-center justify-center px-3 py-3">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                checked={allPageSelected}
                ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                onChange={() =>
                  allPageSelected
                    ? dispatch({ type: "DESELECT_ALL" })
                    : dispatch({ type: "SELECT_ALL", ids: pageIds })
                }
              />
            </div>
            {/* Date */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <button
                onClick={() => dispatch({ type: "SET_SORT", field: "date" })}
                className="flex items-center gap-1.5 hover:text-brand-600 w-fit"
              >
                Date
                {sort.field === "date" ? (sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : null}
              </button>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={filter.dateFrom}
                  onChange={(e) => dispatch({ type: "SET_FILTER", filter: { dateFrom: e.target.value }, autoSelect: e.target.value !== "" })}
                  className="h-7 w-[85px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400"
                />
                <span className="text-slate-300">-</span>
                <input
                  type="date"
                  value={filter.dateTo}
                  onChange={(e) => dispatch({ type: "SET_FILTER", filter: { dateTo: e.target.value }, autoSelect: e.target.value !== "" })}
                  className="h-7 w-[85px] rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400"
                />
              </div>
            </div>
            {/* Narration */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <button
                onClick={() => dispatch({ type: "SET_SORT", field: "narration" })}
                className="flex items-center gap-1.5 hover:text-brand-600 w-fit"
              >
                Narration
                {sort.field === "narration" ? (sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : null}
              </button>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter"
                  value={filter.narrationFilter}
                  onChange={(e) => dispatch({ type: "SET_FILTER", filter: { narrationFilter: e.target.value }, autoSelect: e.target.value !== "" })}
                  className="h-7 w-full rounded border border-slate-200 bg-white pl-7 pr-7 text-xs text-slate-600 outline-none focus:border-brand-400 placeholder:text-slate-300"
                />
                {filter.narrationFilter && (
                  <button
                    onClick={() => dispatch({ type: "SET_FILTER", filter: { narrationFilter: "" }, autoSelect: false })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Amount */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <button
                onClick={() => dispatch({ type: "SET_SORT", field: "amount" })}
                className="flex items-center gap-1.5 hover:text-brand-600 w-fit"
              >
                Amount
                {sort.field === "amount" ? (sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : null}
              </button>
              <input
                type="text"
                placeholder="Filter"
                value={filter.amountFilter}
                onChange={(e) => dispatch({ type: "SET_FILTER", filter: { amountFilter: e.target.value }, autoSelect: e.target.value !== "" })}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400 placeholder:text-slate-300"
              />
            </div>
            {/* Dr/Cr */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <div className="text-xs">Dr/Cr</div>
              <select
                className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 outline-none focus:border-brand-400"
                value={filter.drCrFilter}
                onChange={(e) => dispatch({ type: "SET_FILTER", filter: { drCrFilter: e.target.value as FilterState["drCrFilter"] }, autoSelect: true })}
              >
                <option value="ALL">All</option>
                <option value="DEBIT">Dr</option>
                <option value="CREDIT">Cr</option>
              </select>
            </div>
            {/* Voucher */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <div className="text-xs">Voucher</div>
              <select
                className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 outline-none focus:border-brand-400"
                value={filter.voucherFilter}
                onChange={(e) => dispatch({ type: "SET_FILTER", filter: { voucherFilter: e.target.value }, autoSelect: true })}
              >
                <option value="">All</option>
                {voucherTypes.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            {/* Ledger */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <div className="text-xs">Ledger</div>
              <SearchableSelect
                value={filter.ledgerFilter}
                onChange={(val) => dispatch({ type: "SET_FILTER", filter: { ledgerFilter: val }, autoSelect: false })}
                options={ledgers}
                placeholder="All"
              />
            </div>
            {/* Status */}
            <div className="flex flex-col px-2 py-2 gap-1">
              <div className="text-xs">Status</div>
              <select
                className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 outline-none focus:border-brand-400"
                value={filter.statusFilter}
                onChange={(e) => dispatch({ type: "SET_FILTER", filter: { statusFilter: e.target.value as FilterState["statusFilter"] }, autoSelect: true })}
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
            {/* Action */}
            <div className="flex items-center justify-center px-2 py-2 text-xs">Action</div>
          </div>

          {/* Table body */}
          <div>
            {pageRows.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-slate-400">
                <Search className="mb-2 h-8 w-8" />
                <p className="text-base font-medium">No transactions found</p>
              </div>
            ) : (
              pageRows.map((entry, idx) => {
                const ledger = rows.ledgerMap[entry.row_id] ?? "";
                const voucher = rows.voucherMap[entry.row_id] ?? entry.voucher_type;
                const isSelected = selected.has(entry.row_id);
                const isResolved = Boolean(ledger);
                return (
                  <div
                    key={entry.row_id}
                    className={`grid border-b border-slate-100 text-sm transition-colors ${
                      isSelected ? "bg-brand-50/70" : "bg-white hover:bg-slate-50/70"
                    }`}
                    style={{ gridTemplateColumns: "50px 100px 1fr 120px 80px 100px 180px 90px 70px" }}
                  >
                    {/* Checkbox */}
                    <div className="flex items-center justify-center px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        checked={isSelected}
                        onChange={() => dispatch({ type: "TOGGLE_SELECT", id: entry.row_id })}
                      />
                    </div>
                    {/* Date */}
                    <div className="flex items-center px-2 py-3 text-slate-600">{entry.date}</div>
                    {/* Narration */}
                    <div className="flex items-center px-2 py-3 line-clamp-1 text-slate-700" title={entry.narration}>{entry.narration}</div>
                    {/* Amount */}
                    <div className="flex items-center px-2 py-3 font-semibold text-slate-900">{toRupee(entry.amount)}</div>
                    {/* Dr/Cr */}
                    <div className="flex items-center px-2 py-3">
                      <Badge
                        tone={entry.type === "DEBIT" ? "warning" : "success"}
                        className={entry.type === "DEBIT" ? "bg-red-100 text-red-700 border-red-200 text-xs px-2 py-0.5" : "bg-emerald-100 text-emerald-700 border-emerald-200 text-xs px-2 py-0.5"}
                      >
                        {entry.type === "DEBIT" ? "Dr" : "Cr"}
                      </Badge>
                    </div>
                    {/* Voucher */}
                    <div className="flex items-center px-2 py-3">
                      <select
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400"
                        value={voucher}
                        onChange={(e) => dispatch({ type: "UPDATE_VOUCHER", id: entry.row_id, voucher: e.target.value as StatementEntry["voucher_type"] })}
                      >
                        {Array.from(new Set([...voucherTypes, voucher])).map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    {/* Ledger */}
                    <div className="flex items-center px-2 py-3">
                      <SearchableSelect
                        value={ledger}
                        onChange={(val) => dispatch({ type: "UPDATE_LEDGER", id: entry.row_id, ledger: val })}
                        options={ledgers}
                        placeholder="-- Select --"
                      />
                    </div>
                    {/* Status */}
                    <div className="flex items-center px-2 py-3">
                      <Badge
                        tone={isResolved ? "success" : "warning"}
                        className={isResolved ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-xs px-2 py-0.5" : "bg-amber-100 text-amber-700 border-amber-200 text-xs px-2 py-0.5"}
                      >
                        {isResolved ? "Resolved" : "Pending"}
                      </Badge>
                    </div>
                    {/* Action */}
                    <div className="flex items-center justify-center px-2 py-3">
                      <button
                        onClick={() => dispatch({ type: "DELETE_ONE", id: entry.row_id })}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Exclude this row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom pagination */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3">
            <span className="text-sm text-slate-500">{PAGE_SIZE} rows per page</span>
            <div className="flex items-center gap-1">
              <button onClick={() => dispatch({ type: "SET_PAGE", page: 1 })} disabled={page === 1} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronsLeft className="h-5 w-5" />
              </button>
              <button onClick={() => dispatch({ type: "SET_PAGE", page: Math.max(1, page - 1) })} disabled={page === 1} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) p = i + 1;
                else if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
                return (
                  <button
                    key={`page-${p}`}
                    onClick={() => dispatch({ type: "SET_PAGE", page: p })}
                    className={`h-8 w-8 rounded text-sm font-medium ${
                      page === p ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button onClick={() => dispatch({ type: "SET_PAGE", page: Math.min(totalPages, page + 1) })} disabled={page === totalPages} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronRight className="h-5 w-5" />
              </button>
              <button onClick={() => dispatch({ type: "SET_PAGE", page: totalPages })} disabled={page === totalPages} className="rounded p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronsRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
