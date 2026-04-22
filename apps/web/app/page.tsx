import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export default async function MarketingHomePage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 selection:bg-brand-100 selection:text-brand-900">
      {/* Background Orbs */}
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-brand-200/40 blur-[120px]" />
      <div className="absolute right-[-10%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-mint-200/30 blur-[120px]" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 mx-auto max-w-[1320px] px-6 py-8 md:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white shadow-lg ring-1 ring-slate-800">
              A
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              Accountant <span className="text-brand-600">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="font-medium text-slate-600 hover:text-slate-900">
                Log In
              </Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto mt-24 flex max-w-5xl flex-col items-center text-center md:mt-32">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-brand-200 bg-brand-50/50 px-4 py-1.5 text-sm font-semibold text-brand-700 backdrop-blur-sm">
            <Sparkles className="h-4 w-4" />
            <span>Autonomous Tally Pipeline</span>
          </div>
          
          <h1 className="mt-8 max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight text-slate-900 md:text-7xl">
            The Future of Accounting <br />
            is <span className="bg-gradient-to-r from-brand-600 to-indigo-600 bg-clip-text text-transparent">Autonomous</span>
          </h1>
          
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-600 md:text-xl font-medium">
            Smarter data entry. Intelligent bank reconciliations. <br/>
            Real-time ledger mapping for Tally Prime.
          </p>

          <div className="mt-12 flex w-full flex-col items-center justify-center gap-4 md:flex-row">
            <Link href="/waitlist">
              <Button size="lg" className="h-14 px-10 text-lg bg-slate-900 text-white hover:bg-slate-800 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95">
                Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>

          <div className="mt-20 flex items-center justify-center gap-8 opacity-40 grayscale transition-all hover:opacity-100 hover:grayscale-0">
            <span className="text-xs font-bold tracking-[0.2em] text-slate-900 uppercase">Tally Prime Compatible</span>
            <span className="h-4 w-px bg-slate-300" />
            <span className="text-xs font-bold tracking-[0.2em] text-slate-900 uppercase">Bank Grade Privacy</span>
          </div>
        </section>

        <footer className="mt-40 border-t border-slate-200 py-12 text-center text-slate-500">
          <p className="text-sm">© 2026 Accountant AI. Built with ❤️ from Bangalore</p>
        </footer>
      </div>
    </main>
  );
}
