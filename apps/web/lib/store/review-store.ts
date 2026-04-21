"use client";

import { create } from "zustand";
import type { StatementEntry } from "@vouchr/contracts";

type ReviewState = {
  original: StatementEntry[];
  entries: StatementEntry[];
  dirty: boolean;
  setInitial: (rows: StatementEntry[]) => void;
  updateLedger: (rowId: string, ledger: string) => void;
  updateVoucher: (rowId: string, voucher: StatementEntry["voucher_type"]) => void;
  excludeEntry: (rowId: string) => void;
  excludeEntries: (rowIds: string[]) => void;
  bulkUpdateLedger: (rowIds: string[], ledger: string) => void;
  reset: () => void;
};

function cloneRows(rows: StatementEntry[]) {
  return rows.map((row) => ({ ...row }));
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  original: [],
  entries: [],
  dirty: false,
  setInitial: (rows) => {
    set({
      original: cloneRows(rows),
      entries: cloneRows(rows),
      dirty: false
    });
  },
  updateLedger: (rowId, ledger) => {
    const next = get().entries.map((entry) => (entry.row_id === rowId ? { ...entry, ledger_name: ledger } : entry));
    set({ entries: next, dirty: true });
  },
  updateVoucher: (rowId, voucher) => {
    const next = get().entries.map((entry) =>
      entry.row_id === rowId
        ? {
            ...entry,
            voucher_type: voucher,
            is_contra: voucher === "Contra"
          }
        : entry
    );
    set({ entries: next, dirty: true });
  },
  excludeEntry: (rowId) => {
    const next = get().entries.map((entry) =>
      entry.row_id === rowId ? { ...entry, excluded: true } : entry
    );
    set({ entries: next, dirty: true });
  },
  excludeEntries: (rowIds) => {
    const idSet = new Set(rowIds);
    const next = get().entries.map((entry) =>
      idSet.has(entry.row_id) ? { ...entry, excluded: true } : entry
    );
    set({ entries: next, dirty: true });
  },
  bulkUpdateLedger: (rowIds, ledger) => {
    const idSet = new Set(rowIds);
    const next = get().entries.map((entry) =>
      idSet.has(entry.row_id) ? { ...entry, ledger_name: ledger } : entry
    );
    set({ entries: next, dirty: true });
  },
  reset: () => {
    set({ entries: cloneRows(get().original), dirty: false });
  }
}));
