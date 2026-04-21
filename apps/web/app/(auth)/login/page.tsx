"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session } = authClient.useSession();

  if (session) {
    router.push("/dashboard");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });

    if (error) {
      toast.error(error.message);
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2 bg-white">
      <section className="hidden md:grid place-items-center border-r border-slate-100 bg-[#f8f7ff]">
        <div className="h-[520px] w-[640px] rounded-2xl bg-[radial-gradient(circle_at_40%_30%,#ede8ff_0%,#f8f7ff_58%,#ffffff_100%)] p-8" />
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-[420px]">
          <h1 className="font-heading text-4xl font-semibold text-slate-900">Log In to VouchrIt</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your credentials to access your dashboard</p>
          
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email"
                type="email" 
                placeholder="john@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password"
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </Button>
          </form>
          
          <div className="mt-4 flex justify-between text-sm">
            <Link href="#" className="text-brand-600 hover:underline">
              Log in with OTP
            </Link>
            <Link href="#" className="text-brand-600 hover:underline">
              Forgot Password
            </Link>
          </div>
          
          <p className="mt-8 text-center text-sm text-slate-500">
            Don't have an account?{" "}
            <Link href="/signup" className="text-brand-600 font-medium hover:underline">
              Sign Up
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
