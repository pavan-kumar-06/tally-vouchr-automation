import { Info } from "lucide-react";

export function ConnectivityStatus() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
      <h3 className="font-heading text-xl font-semibold">Connectivity Status</h3>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Tally Connector</p>
            <p className="text-xs text-emerald-600">Connected</p>
          </div>
          <Info className="h-4 w-4 text-slate-500" />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Tally Software</p>
            <p className="text-xs text-emerald-600">Connected</p>
          </div>
          <Info className="h-4 w-4 text-slate-500" />
        </div>
      </div>
    </div>
  );
}
