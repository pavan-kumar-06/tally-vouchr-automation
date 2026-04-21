import { Button } from "@/components/ui/button";
import { CompanyBoard } from "@/components/dashboard/company-board";
import { HowItWorks } from "@/components/dashboard/how-it-works";
import { LayoutDashboard, Download, Laptop, PlayCircle } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <div className="flex items-center gap-2 text-brand-600 mb-1">
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Workspace</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Manage your clients, automations, and Tally connectivity.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="h-11 rounded-xl border-slate-200 px-6 font-semibold">
            <Download className="mr-2 h-4 w-4" /> Download Tally Connector
          </Button>
          <div className="h-11 w-11 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold border-2 border-white shadow-soft">
            KN
          </div>
        </div>
      </header>

      {/* How It Works Banner (Exactly like screenshot) */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-700 p-8 text-white shadow-xl shadow-brand-200/50">
        <div className="relative z-10">
          <h3 className="text-2xl font-bold">How it Works?</h3>
          <div className="mt-8 grid grid-cols-3 gap-12">
            <Step 
              number="1" 
              title="Download Tally Connector" 
              desc="Download and install Tally connector" 
              icon={<Download className="h-4 w-4" />}
            />
            <Step 
              number="2" 
              title="Run Tally Connector" 
              desc="Click on the icon in your system tray" 
              icon={<PlayCircle className="h-4 w-4" />}
            />
            <Step 
              number="3" 
              title="Run Tally Software" 
              desc="Ensure desired company is active" 
              icon={<Laptop className="h-4 w-4" />}
            />
          </div>
        </div>
        {/* Background decorative elements */}
        <div className="absolute right-[-5%] top-[-20%] h-64 w-64 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[20%] h-64 w-64 rounded-full bg-brand-800/20 blur-3xl" />
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
          <CompanyBoard />
      </div>
    </div>
  );
}

function Step({ number, title, desc, icon }: { number: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-400 text-sm font-bold text-brand-900 border-4 border-white/20">
          {number}
        </div>
        <h4 className="font-semibold text-white">{title}</h4>
      </div>
      <p className="mt-2 text-sm text-brand-100/80 leading-relaxed">{desc}</p>
      <button className="mt-2 flex items-center gap-1 text-[11px] font-medium text-mint-300 hover:text-white transition-colors underline underline-offset-4">
        {icon} Learn more
      </button>
      
      {/* Connector lines between steps */}
      {number !== "3" && (
        <div className="absolute right-[-40px] top-4 hidden h-[1px] w-24 bg-gradient-to-r from-mint-400/50 to-transparent lg:block" />
      )}
    </div>
  );
}
