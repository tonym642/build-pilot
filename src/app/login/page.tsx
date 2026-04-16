"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSuccess("Check your email for a password reset link.");
  }

  const inputClass = "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-secondary)] placeholder:text-[var(--text-faint)] focus:border-[rgba(90,154,245,0.35)] focus:outline-none transition-colors";
  const labelClass = "text-[11px] font-semibold uppercase tracking-widest mb-1.5 block";

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "100vh", background: "var(--surface-0)" }}
    >
      <div
        className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] p-8"
        style={{ background: "var(--surface-2)" }}
      >
        <h1
          className="text-[22px] font-semibold text-center mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Build Pilot
        </h1>
        <p
          className="text-[13px] text-center mb-8"
          style={{ color: "var(--text-muted)" }}
        >
          {mode === "login" ? "Sign in to your account" : "Reset your password"}
        </p>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" className={inputClass} />
            </div>

            {error && <p className="text-[12px] text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <button
              type="button"
              onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
              className="text-[12px] transition-colors"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" className={inputClass} />
            </div>

            {error && <p className="text-[12px] text-red-400">{error}</p>}
            {success && <p className="text-[12px] text-green-400">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              className="text-[12px] transition-colors"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
