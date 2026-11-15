"use client";

type Router = { push: (href: string) => void };

/**
 * Client-side navigation with a safety net: if the in-app navigation hasn't
 * happened after a few seconds (the "Opening…" button seemed stuck until a
 * refresh), fall back to a normal page load.
 */
export function navigate(router: Router, href: string, fallbackMs = 4000) {
  const target = new URL(href, window.location.origin).pathname;
  router.push(href);
  window.setTimeout(() => {
    if (window.location.pathname !== target) window.location.assign(href);
  }, fallbackMs);
}
