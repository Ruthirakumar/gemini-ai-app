"use client";

import type { CheckedQuestion, QuestionStatus } from "@/lib/homework/types";
import PracticeQuestion from "./PracticeQuestion";

export const STATUS_STYLES: Record<
  QuestionStatus,
  { label: string; icon: string; badge: string; border: string; accent: string }
> = {
  correct: {
    label: "Correct",
    icon: "✓",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    border: "border-l-emerald-500",
    accent: "text-emerald-700",
  },
  incorrect: {
    label: "Not quite",
    icon: "✗",
    badge: "bg-rose-100 text-rose-800 ring-rose-200",
    border: "border-l-rose-500",
    accent: "text-rose-700",
  },
  needs_review: {
    label: "Needs review",
    icon: "?",
    badge: "bg-amber-100 text-amber-900 ring-amber-200",
    border: "border-l-amber-500",
    accent: "text-amber-800",
  },
};

interface Props {
  question: CheckedQuestion;
  showPage: boolean;
  onPracticeFinished: (id: string, outcome: "correct" | "revealed") => void;
}

export default function QuestionCard({ question, showPage, onPracticeFinished }: Props) {
  const style = STATUS_STYLES[question.status];
  const isIncorrect = question.status === "incorrect";
  const isReview = question.status === "needs_review";

  return (
    <article
      id={question.id}
      className={`scroll-mt-24 rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${style.border}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-slate-100 px-2 text-sm font-bold text-slate-700">
            {question.questionNumber}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {question.topic}
              {showPage && ` · Page ${question.page}`}
            </p>
            <h3 className="mt-0.5 whitespace-pre-line break-words text-base font-semibold text-slate-900 sm:text-lg">
              {question.question}
            </h3>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${style.badge}`}>
          <span aria-hidden>{style.icon}</span>
          {style.label}
        </span>
      </header>

      <dl className={`mt-4 grid gap-3 ${isIncorrect && question.correctAnswer ? "sm:grid-cols-2" : ""}`}>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your answer</dt>
          <dd className={`mt-1 break-words font-medium ${question.studentAnswer ? "text-slate-900" : "italic text-slate-400"}`}>
            {question.studentAnswer ?? (isReview ? "Couldn't read this" : "No answer")}
          </dd>
        </div>
        {isIncorrect && question.correctAnswer && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Correct answer</dt>
            <dd className="mt-1 break-words font-semibold text-emerald-900">{question.correctAnswer}</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-slate-700">{question.explanation}</p>

      {isIncorrect && question.whatWentWrong && (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-semibold">What happened: </span>
          {question.whatWentWrong}
        </p>
      )}

      {isReview && question.reviewReason && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Please check: </span>
          {question.reviewReason}
        </p>
      )}

      {question.working.length > 0 && !isReview && (
        <details className="group mt-4" open={isIncorrect}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-indigo-700 hover:text-indigo-800">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>{" "}
            {isIncorrect ? "Let's solve it step by step" : "See the working"}
          </summary>
          <ol className="mt-3 space-y-2">
            {question.working.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {isIncorrect && question.practiceQuestion && (
        <div className="mt-5">
          <PracticeQuestion
            practice={question.practiceQuestion}
            onFinished={(outcome) => onPracticeFinished(question.id, outcome)}
          />
        </div>
      )}
    </article>
  );
}
