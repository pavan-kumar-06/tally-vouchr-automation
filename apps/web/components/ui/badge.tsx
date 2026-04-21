import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning";
  className?: string;
}) {
  const styles = {
    neutral: "bg-slate-100 text-slate-600",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700"
  };

  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", styles[tone], className)}>{children}</span>;
}
