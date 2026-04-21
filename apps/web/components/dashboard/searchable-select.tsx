"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X } from "lucide-react";

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search...",
  className = "",
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(
    (o) => !search || o.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
    inputRef.current?.focus();
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed gap-1"
      >
        <span className={value ? "text-slate-800 truncate" : "text-slate-400 truncate"}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && (
            <X
              className="h-3 w-3 text-slate-400 hover:text-slate-600"
              onClick={handleClear}
            />
          )}
          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-lg border border-slate-200 bg-white shadow-lg">
          {/* Search input */}
          <div className="flex items-center border-b border-slate-100 px-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-full border-0 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">No matches</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    opt === value
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
