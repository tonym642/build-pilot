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

  console.log("[auth/callback] params:", { code: code ? "present" : "missing", type, next });

  if (code) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    console.log("[auth/callback] exchange result:", { error: error?.message, hasSession: !!data?.session, amr: data?.session?.user?.amr });

    if (!error && data.session) {
      // Check if this is a password recovery flow
      // Supabase sets amr to "recovery" for password reset tokens
      const isRecovery =
        type === "recovery" ||
        data.session.user?.recovery_sent_at != null ||
        (data.session.user?.amr ?? []).some(
          (a: { method: string }) => a.method === "recovery"
        );

      if (isRecovery) {
        return NextResponse.redirect(new URL("/login/reset-password", request.url));
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If code exchange failed, redirect to login with error
  return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
}
