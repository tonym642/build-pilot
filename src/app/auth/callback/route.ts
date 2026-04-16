import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

/**
 * Supabase redirects here after email confirmation / password reset.
 * Exchanges the auth code for a session, then redirects to the appropriate page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next") || "/";

  if (code) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Check if this is a password recovery flow
      const user = data.session.user as unknown as Record<string, unknown>;
      const amr = Array.isArray(user?.amr) ? user.amr : [];
      const isRecovery =
        type === "recovery" ||
        user?.recovery_sent_at != null ||
        amr.some((a: Record<string, unknown>) => a.method === "recovery");

      if (isRecovery) {
        return NextResponse.redirect(new URL("/login/reset-password", request.url));
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If code exchange failed, redirect to login with error
  return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
}
