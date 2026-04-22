"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.signup(email, password, name);
      toast.success("Account created successfully");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2 bg-white">
      <section className="hidden md:grid place-items-center border-r border-slate-100 bg-[#f8f7ff]">
        <div className="h-[520px] w-[520px] rounded-2xl bg-[radial-gradient(circle_at_40%_30%,#ede8ff_0%,#f8f7ff_58%,#ffffff_100%)] p-8 flex flex-col justify-center">
          <h2 className="text-3xl font-bold text-brand-600 mb-4">Accountant AI</h2>
          <p className="text-slate-600 text-lg">Automate your Tally accounting pipeline in minutes. Zero data entry, 100% accuracy.</p>
        </div>
      </section>
      <section className="grid place-items-center p-6">
        <div className="w-full max-w-[420px]">
          <h1 className="font-heading text-4xl font-semibold text-slate-900">Create Account</h1>
          <p className="mt-2 text-sm text-slate-500">Join Accountant AI and streamline your accounting.</p>

          <form onSubmit={handleSignup} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
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
              {loading ? "Creating Account..." : "Sign Up"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              Log In
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
