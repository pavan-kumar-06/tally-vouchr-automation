import Link from "next/link";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { ArrowLeft } from "lucide-react";

export default function WaitlistPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 selection:bg-brand-100 selection:text-brand-900">
      {/* Background Decor */}
      <div className="absolute left-[-10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-brand-200/40 blur-[120px]" />
      <div className="absolute right-[-10%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-mint-200/30 blur-[120px]" />
      
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12 md:px-12">
        <header className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </header>

        <div className="flex flex-col items-center text-center space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-2xl font-bold text-white shadow-xl">
            A
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Join the Accountant <span className="text-brand-600">AI</span> Waitlist
          </h1>
          <p className="max-w-xl text-lg text-slate-600">
            Get early access to autonomous Tally accounting. 
            Fill in your details below and we'll reach out when we're ready.
          </p>
          
          <div className="mt-8 w-full max-w-md">
            <WaitlistForm />
          </div>
        </div>

        <footer className="mt-24 text-center text-sm text-slate-400">
          <p>© 2026 Accountant AI. Built for the future of finance.</p>
        </footer>
      </div>
    </main>
  );
}
