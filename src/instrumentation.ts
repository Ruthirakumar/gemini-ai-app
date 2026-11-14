/**
 * Runs once when the Next.js server starts.
 *
 * Prefer IPv4 when a hostname has both IPv4 and IPv6 addresses. On networks
 * whose IPv6 route is broken (common on home broadband), Node can otherwise
 * pick an IPv6 address and hang for ~60s before "fetch failed" when calling
 * Supabase or Gemini. Every service this app uses is reachable over IPv4, so
 * this is safe everywhere, including Vercel.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
  }
}
