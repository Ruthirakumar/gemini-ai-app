"use client";

import { useState } from "react";

/** The cropped worksheet picture a question needs. Tap to see it bigger. */
export default function QuestionFigure({ src, alt, size = "md" }: { src: string; alt: string; size?: "sm" | "md" | "lg" }) {
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const heights = { sm: "max-h-28", md: "max-h-56", lg: "max-h-80" };
  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className="group relative inline-block max-w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm hover:border-indigo-300"
        aria-label={`${alt} - tap to make it bigger`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL from storage */}
        <img src={src} alt={alt} onError={() => setFailed(true)} className={`${heights[size]} w-auto max-w-full object-contain`} />
        <span aria-hidden className="absolute right-2 bottom-2 rounded-lg bg-white/90 px-1.5 text-xs text-slate-500 opacity-0 group-hover:opacity-100">
          🔍
        </span>
      </button>

      {zoomed && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4" onClick={() => setZoomed(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL from storage */}
          <img src={src} alt={alt} className="max-h-[85vh] max-w-full rounded-2xl bg-white p-3 shadow-xl" />
          <button type="button" className="absolute top-4 right-4 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-800" onClick={() => setZoomed(false)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
