import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { HomeworkError } from "@/lib/homework/errors";
import { getSupabasePublicConfig, serverRealtimeOptions } from "./config";

function notConfigured(): never {
  throw new HomeworkError(
    503,
    "supabase_not_configured",
    "The homework library isn't set up yet. Please ask a grown-up to add the Supabase settings."
  );
}

/**
 * Per-request client acting AS the signed-in user (RLS applies).
 * Must be created per request (never shared between requests).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const config = getSupabasePublicConfig();
  if (!config) notConfigured();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    ...serverRealtimeOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a context where cookies are read-only; proxy.ts refreshes the session.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS: use ONLY on the server, ONLY after the
 * caller's ownership has been verified, and only for answer keys, marking
 * results and atomic content saves.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const config = getSupabasePublicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceKey) notConfigured();
  return createClient(config.url, serviceKey, {
    ...serverRealtimeOptions(),
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
}

/** Whether the signed-in user is listed in public.app_admins. */
export async function isAdminUser(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    // Before the shared-library migration is run the function doesn't exist: nobody is an admin.
    console.warn("[auth] is_admin check failed", { code: error.code });
    return false;
  }
  return data === true;
}

/** Authenticates and also tells whether the user is an admin. */
export async function requireViewer(): Promise<AuthContext & { isAdmin: boolean }> {
  const ctx = await requireUser();
  return { ...ctx, isAdmin: await isAdminUser(ctx.supabase) };
}

/** Authenticates the request. Throws a friendly 401 if not signed in. */
export async function requireUser(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  // getClaims() verifies the JWT; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error?.name === "AuthRetryableFetchError") {
    // A network problem, not a signed-out user: don't send them to the sign-in form.
    console.error("[auth] could not reach Supabase Auth", { name: error.name });
    throw new HomeworkError(503, "auth_unreachable", "Homework Buddy can't reach the sign-in service right now. Please check your internet connection and try again.");
  }
  if (error || !userId) {
    throw new HomeworkError(401, "not_signed_in", "Please sign in to continue.");
  }
  return { supabase, userId };
}
