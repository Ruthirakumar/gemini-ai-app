import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverRealtimeOptions } from "@/lib/supabase/config";

/**
 * Keeps the Supabase auth session fresh by refreshing the token cookies on
 * each request. Does nothing when Supabase isn't configured.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    ...serverRealtimeOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Refreshes the session if expired. Do not add logic between client creation and this call.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Skip static assets and the photo checker's large uploads.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/homework/check|.*\\.(?:svg|png|jpg|jpeg|gif|webp|pdf)$).*)",
  ],
};
