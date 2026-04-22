"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard", label: "Companies", icon: Building2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div className="mx-auto flex max-w-[1400px] gap-4">
        <aside className="sticky top-6 flex h-[calc(100vh-3rem)] w-20 flex-col items-center rounded-2xl bg-slate-900 px-3 py-6 text-slate-200 shadow-xl">
          <Link href="/dashboard" className="mb-10 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white font-bold text-xl shadow-lg ring-4 ring-white/10">
            V
          </Link>

          <nav className="flex flex-col gap-4 flex-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "grid h-12 w-12 place-items-center rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-white/10 text-white ring-1 ring-white/20"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
            <button
              title={session?.user?.name || "Profile"}
              className="grid h-12 w-12 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all"
            >
              <User className="h-5 w-5" />
            </button>
            <button
              onClick={handleLogout}
              title="Logout"
              className="grid h-12 w-12 place-items-center rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
