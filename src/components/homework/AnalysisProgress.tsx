"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "Looking at your worksheet", after: 0 },
  { label: "Finding the questions", after: 4 },
  { label: "Reading your answers", after: 9 },
  { label: "Checking each answer", after: 15 },
  { label: "Writing explanations and practice questions", after: 24 },
];

interface Props {
  pageCount: number;
  onCancel: () => void;
}

export default function AnalysisProgress({ pageCount, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);

  const current = STEPS.reduce((acc, step, i) => (elapsed >= step.after ? i : acc), 0);
  // Eases towards 95% so the bar keeps moving without claiming to be finished.
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 18))));

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200 opacity-60" />
          <span aria-hidden className="relative grid h-12 w-12 place-items-center rounded-full bg-indigo-600 text-xl text-white">
            🔍
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Checking your homework…</h2>
          <p className="text-sm text-slate-500">
            {pageCount > 1 ? `${pageCount} pages` : "1 page"} · this usually takes 10-40 seconds
          </p>
        </div>
      </div>

      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Checking progress">
        <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-6 space-y-3">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-emerald-100 text-emerald-700"
                    : active
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={done ? "text-slate-500" : active ? "font-semibold text-slate-900" : "text-slate-400"}>
                {step.label}
                {active && <span className="animate-pulse">…</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
        <span>{elapsed}s</span>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </section>
  );
}
