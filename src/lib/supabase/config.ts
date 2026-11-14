// Public Supabase settings. The anon key is designed to be public: all data
// access is protected by Row Level Security and column privileges.
// Values are read lazily so the app (and the existing homework checker)
// still builds and runs when Supabase isn't configured yet.

export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const WORKSHEET_BUCKET = "worksheets";

/**
 * supabase-js creates its Realtime client eagerly and throws on Node.js 20,
 * which has no global WebSocket. This app never uses Realtime on the server,
 * so on such runtimes we pass a transport that fails only if Realtime is
 * actually used. On Node.js 22+ (and in browsers) the native WebSocket is used.
 */
class RealtimeUnavailable {
  constructor() {
    throw new Error("Supabase Realtime is not used on the server in this app.");
  }
}

export function serverRealtimeOptions() {
  return typeof globalThis.WebSocket === "undefined"
    ? { realtime: { transport: RealtimeUnavailable as unknown as typeof WebSocket } }
    : {};
}
