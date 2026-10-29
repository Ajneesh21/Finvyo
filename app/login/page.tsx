"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, TrendingUp, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        setPassword("");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30">
            <TrendingUp className="h-7 w-7 text-blue-400" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Finvyo</h1>
            <p className="text-sm text-slate-400 mt-0.5">Your wealth. In view.</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300">Private Access</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 pr-11 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 animate-in fade-in">
                <span className="inline-block w-1 h-1 rounded-full bg-rose-400" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Finvyo &copy; {new Date().getFullYear()} &middot; Personal portfolio tracker
        </p>
      </div>
    </div>
  );
}
