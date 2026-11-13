"use client";

import { useState } from "react";
import type { HomeworkResult, QuestionStatus } from "@/lib/homework/types";
import QuestionCard from "./QuestionCard";

type Filter = "all" | QuestionStatus;

interface Props {
  result: HomeworkResult;
  pageCount: number;
  onStartOver: () => void;
}

function ScoreRing({ percentage }: { percentage: number | null }) {
  const value = percentage ?? 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const colour = value >= 80 ? "stroke-emerald-500" : value >= 50 ? "stroke-indigo-500" : "stroke-amber-500";

  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} className="fill-none stroke-slate-100" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={`fill-none ${colour} transition-all duration-700`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <span className="text-2xl font-bold text-slate-900">{percentage === null ? "–" : `${percentage}%`}</span>
      </div>
    </div>
  );
}

export default function HomeworkResults({ result, pageCount, onStartOver }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [practiceDone, setPracticeDone] = useState<Record<string, "correct" | "revealed">>({});

  const practiceTotal = result.questions.filter((q) => q.practiceQuestion).length;
  const practiceCompleted = Object.keys(practiceDone).length;
  const practiceCorrect = Object.values(practiceDone).filter((o) => o === "correct").length;
  const marked = result.correctCount + result.incorrectCount;

  const filters: { value: Filter; label: string; count: number; active: string }[] = [
    { value: "all", label: "All", count: result.totalQuestions, active: "bg-slate-900 text-white" },
    { value: "correct", label: "Correct", count: result.correctCount, active: "bg-emerald-600 text-white" },
    { value: "incorrect", label: "Incorrect", count: result.incorrectCount, active: "bg-rose-600 text-white" },
    { value: "needs_review", label: "Needs review", count: result.needsReviewCount, active: "bg-amber-500 text-amber-950" },
  ];

  const visibleCount = result.questions.filter((q) => filter === "all" || q.status === filter).length;

  function practiseMistakes() {
    setFilter("incorrect");
    const first = result.questions.find((q) => q.practiceQuestion && !practiceDone[q.id]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(first.id)?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing percentage={result.scorePercentage} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                {result.subject}
              </span>
              {result.worksheetTitle && <span className="text-sm text-slate-500">{result.worksheetTitle}</span>}
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{result.summary}</h2>
            <p className="mt-2 text-slate-600">{result.encouragement}</p>
            {marked > 0 && marked < result.totalQuestions && (
              <p className="mt-1 text-sm text-slate-500">
                Your score is based on the {marked} questions I could mark.
              </p>
            )}
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Questions", value: result.totalQuestions, cls: "bg-slate-50 text-slate-900" },
            { label: "Correct", value: result.correctCount, cls: "bg-emerald-50 text-emerald-800" },
            { label: "Incorrect", value: result.incorrectCount, cls: "bg-rose-50 text-rose-800" },
            { label: "Needs review", value: result.needsReviewCount, cls: "bg-amber-50 text-amber-900" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-2xl px-4 py-3 ${stat.cls}`}>
              <dt className="text-xs font-semibold uppercase tracking-wide opacity-80">{stat.label}</dt>
              <dd className="mt-1 text-2xl font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {result.imageQualityNotes && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">About your photo: </span>
            {result.imageQualityNotes}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {practiceTotal > 0 && (
            <button
              type="button"
              onClick={practiseMistakes}
              className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {practiceCompleted === 0
                ? `Practise my mistakes (${practiceTotal})`
                : practiceCompleted < practiceTotal
                  ? `Keep practising (${practiceCompleted}/${practiceTotal} done)`
                  : `Practice complete: ${practiceCorrect}/${practiceTotal} solved by you`}
            </button>
          )}
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Check another homework
          </button>
        </div>
      </section>

      {/* Filters */}
      <div role="group" aria-label="Filter questions" className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => {
          const selected = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                selected ? f.active : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label} <span className="opacity-75">({f.count})</span>
            </button>
          );
        })}
      </div>

      {/* Question cards: hidden rather than unmounted so practice progress is kept when filtering. */}
      <div className="space-y-4">
        {result.questions.map((question) => (
          <div key={question.id} hidden={filter !== "all" && question.status !== filter}>
            <QuestionCard
              question={question}
              showPage={pageCount > 1}
              onPracticeFinished={(id, outcome) =>
                setPracticeDone((prev) => (prev[id] ? prev : { ...prev, [id]: outcome }))
              }
            />
          </div>
        ))}

        {visibleCount === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-500">
            {filter === "incorrect"
              ? "No incorrect answers - brilliant! 🌟"
              : filter === "needs_review"
                ? "Nothing needs reviewing. 👍"
                : "No questions here yet."}
          </div>
        )}
      </div>
    </div>
  );
}
