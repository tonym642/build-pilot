"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/"), 2000);
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
        <h1 className="text-[22px] font-semibold text-center mb-1" style={{ color: "var(--text-primary)" }}>
          Build Pilot
        </h1>
        <p className="text-[13px] text-center mb-8" style={{ color: "var(--text-muted)" }}>
          Set a new password
        </p>

        {success ? (
          <div className="text-center">
            <p className="text-[13px] text-green-400 mb-2">Password updated successfully!</p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Redirecting...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="At least 6 characters" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)", letterSpacing: "0.06em" }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Confirm your password" className={inputClass} />
            </div>

            {error && <p className="text-[12px] text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/login")}
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
