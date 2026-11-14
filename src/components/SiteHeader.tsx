"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthGate";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const LINKS = [
  { href: "/", label: "Check a photo", match: (p: string) => p === "/" },
  { href: "/learn", label: "Practise", match: (p: string) => p.startsWith("/learn") },
  { href: "/library", label: "Library", match: (p: string) => p.startsWith("/library") },
  { href: "/chat", label: "Ask", match: (p: string) => p.startsWith("/chat") },
] as const;

/** Static placeholder (same height) shown while the URL-aware header streams in. */
export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-lg text-white shadow-sm">✓</span>
          <span className="text-base sm:text-lg">AI Homework Buddy</span>
        </Link>
      </div>
    </header>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-lg text-white shadow-sm">
            ✓
          </span>
          <span className="text-base sm:text-lg">AI Homework Buddy</span>
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {auth.status === "signed_in" && (
            <button
              type="button"
              onClick={signOut}
              title={auth.user.email ?? undefined}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
