"use client";

import { useState, useEffect } from "react";
import { Power, ExternalLink, Globe, ShieldCheck } from "lucide-react";

export default function NativeConnectorGUI() {
  const [isRunning, setIsRunning] = useState(true);
  const [status, setStatus] = useState({
    last_sync: "Never",
    is_syncing: false,
    port: 15000
  });

  const toggleService = () => setIsRunning(!isRunning);

  return (
    <div className="w-[340px] h-[480px] bg-slate-50 rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans border border-slate-200">
      {/* Title Bar */}
      <div className="h-10 bg-white border-b border-slate-100 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 bg-brand-600 rounded flex items-center justify-center text-[10px] text-white font-bold">V</div>
          <span className="text-xs font-semibold text-slate-600">VouchrIt Tally Connector</span>
        </div>
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-200" />
          <div className="w-3 h-3 rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 flex flex-col items-center justify-center gap-6">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-colors ${isRunning ? 'bg-green-100' : 'bg-red-100'}`}>
          <Power className={`h-10 w-10 ${isRunning ? 'text-green-600' : 'text-red-500'}`} />
        </div>

        <button 
          onClick={toggleService}
          className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-all active:scale-95 ${isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
        >
          {isRunning ? "Stop Vouchrit Tally Connector" : "Start Vouchrit Tally Connector"}
        </button>

        <button 
          className="w-full py-3 bg-brand-600 hover:bg-brand-700 rounded-lg font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Globe className="h-4 w-4" />
          Open VouchrIt.com
        </button>

        <div className="mt-4 text-center space-y-2">
          <p className="text-[11px] font-bold text-green-600 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Vouchrit Tally Connector server started on port {status.port}
          </p>
          <p className="text-[10px] text-slate-400">Last Synced: {status.last_sync}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-1 opacity-50">
            <div className="h-4 w-4 bg-brand-600 rounded flex items-center justify-center text-[8px] text-white font-bold">V</div>
            <span className="text-[10px] text-slate-500">vouchrit</span>
         </div>
         <span className="text-[10px] text-slate-400">© 2024 VouchrIt. All rights reserved.</span>
      </div>
    </div>
  );
}
