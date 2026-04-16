import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes auth tokens via Next.js cookies.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in Server Components (read-only).
            // This is fine — the middleware handles token refresh.
          }
        },
      },
    }
  );
}

/**
 * Get the current authenticated user, or null if not logged in.
 */
export async function getUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Require authentication — returns user or throws.
 * Use in API routes: const user = await requireUser();
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
