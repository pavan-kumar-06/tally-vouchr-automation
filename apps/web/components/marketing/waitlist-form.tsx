"use client";

import { useActionState } from "react";
import { joinWaitlist, WaitlistState } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function WaitlistForm() {
  const [state, action, isPending] = useActionState<WaitlistState, FormData>(
    joinWaitlist,
    {}
  );

  if (state.success) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center backdrop-blur-sm animate-in fade-in zoom-in duration-500">
        <div className="rounded-full bg-emerald-500/20 p-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">You're on the list!</h3>
          <p className="mt-1 text-slate-600">
            We'll notify you as soon as we're ready for you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/40 bg-white/60 p-6 shadow-xl backdrop-blur-xl transition-all hover:border-white/60">
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Input
            name="email"
            type="email"
            placeholder="Work email address"
            required
            className="h-12 bg-white/80 transition-all focus:ring-2 focus:ring-brand-500"
            disabled={isPending}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            name="name"
            placeholder="Full name"
            required
            className="h-12 bg-white/80 transition-all focus:ring-2 focus:ring-brand-500"
            disabled={isPending}
          />
          <Input
            name="company"
            placeholder="Company"
            className="h-12 bg-white/80 transition-all focus:ring-2 focus:ring-brand-500"
            disabled={isPending}
          />
        </div>
        
        {state.error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 animate-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{state.error}</p>
          </div>
        )}

        <Button 
          type="submit" 
          size="lg" 
          className="w-full h-12 bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-70 group"
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              Join the Waitlist
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Be among the first to experience the future of Tally automation.
        </p>
      </form>
    </div>
  );
}
