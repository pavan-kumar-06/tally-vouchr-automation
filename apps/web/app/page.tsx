import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function MarketingHomePage() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen grid-overlay bg-[linear-gradient(160deg,#fafaff_0%,#f2f3fb_70%,#eef3fb_100%)]">
      <div className="mx-auto max-w-[1320px] px-8 py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-3xl font-bold text-brand-600">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-brand-600 text-sm text-white">V</span>
            <span className="font-heading">vouchrit</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="secondary">Log In</Button>
            </Link>
            <Link href="/signup">
              <Button>Sign Up</Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto mt-20 max-w-[860px] text-center">
          <p className="font-heading text-2xl font-semibold tracking-wide text-amber-500">Automate Tally Accounting with Vouchrit</p>
          <h1 className="mt-6 text-6xl font-semibold leading-tight text-slate-900">
            Say goodbye to <span className="rounded-xl bg-mint-400 px-2 text-white">Manual Data Entry</span>
            <br />
            & tedious reconciliations
          </h1>
          <div className="mt-8">
            <Button size="lg" className="px-8 text-lg">
              Join waitlist <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-[980px] rounded-2xl border border-white/70 bg-white/80 p-5 shadow-soft backdrop-blur">
          <div className="vouchr-gradient-mint h-[360px] rounded-xl p-6 text-white">
            <div className="grid h-full grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/20 bg-white/10 p-4">Dashboard preview</div>
              <div className="rounded-xl border border-white/20 bg-white/10 p-4">Recommendation overlay preview</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
