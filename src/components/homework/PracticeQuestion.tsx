"use client";

import { FormEvent, useState } from "react";
import { MAX_PRACTICE_ANSWER_LENGTH, MAX_PRACTICE_ATTEMPTS } from "@/lib/homework/constants";
import type { ApiErrorResponse, PracticeResponse, PublicPracticeQuestion } from "@/lib/homework/types";

type Phase = "idle" | "checking" | "try_again" | "correct" | "revealed";

interface Props {
  practice: PublicPracticeQuestion;
  onFinished: (outcome: "correct" | "revealed") => void;
}

export default function PracticeQuestion({ practice, onFinished }: Props) {
  const [answer, setAnswer] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const finished = phase === "correct" || phase === "revealed";
  const busy = phase === "checking";

  async function send(reveal: boolean) {
    const attempt = reveal ? Math.max(1, attempts) : attempts + 1;
    setPhase("checking");
    setError(null);

    try {
      const res = await fetch("/api/homework/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: practice.token, answer: reveal ? "" : answer, attempt, reveal }),
      });
      const data = (await res.json()) as PracticeResponse | ApiErrorResponse;
      if (!data.success) throw new Error(data.error);

      if (!reveal) setAttempts(attempt);
      setFeedback(data.feedback);
      if (data.hint) setHints((prev) => (prev.includes(data.hint!) ? prev : [...prev, data.hint!]));
      setCorrectAnswer(data.correctAnswer);
      setSteps(data.solutionSteps);

      if (data.outcome === "try_again") {
        setPhase("try_again");
      } else {
        setPhase(data.outcome);
        onFinished(data.outcome);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPhase(attempts > 0 ? "try_again" : "idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim() || busy || finished) return;
    void send(false);
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Practice question</p>
        {!finished && attempts > 0 && (
          <p className="text-xs text-slate-500">
            {MAX_PRACTICE_ATTEMPTS - attempts} {MAX_PRACTICE_ATTEMPTS - attempts === 1 ? "try" : "tries"} left
          </p>
        )}
      </div>
      <p className="mt-2 text-base font-medium text-slate-900">{practice.question}</p>

      {!finished && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`practice-${practice.token.slice(0, 12)}`}>
            Your answer
          </label>
          <input
            id={`practice-${practice.token.slice(0, 12)}`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={MAX_PRACTICE_ANSWER_LENGTH}
            placeholder="Type your answer…"
            disabled={busy}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={busy || !answer.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking…" : attempts > 0 ? "Try again" : "Check answer"}
          </button>
        </form>
      )}

      <div aria-live="polite">
        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

        {feedback && (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${
              phase === "correct"
                ? "bg-emerald-100 text-emerald-900"
                : phase === "revealed"
                  ? "bg-white text-slate-800 ring-1 ring-slate-200"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {phase === "correct" ? "🎉 " : ""}
            {feedback}
          </p>
        )}

        {!finished && hints.length > 0 && (
          <div className="mt-3 space-y-2">
            {hints.map((hint, i) => (
              <p key={i} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-amber-200">
                <span aria-hidden>💡</span>
                <span>
                  <span className="font-semibold">Hint{hints.length > 1 ? ` ${i + 1}` : ""}:</span> {hint}
                </span>
              </p>
            ))}
          </div>
        )}

        {finished && correctAnswer && (
          <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">
              Answer: <span className="font-semibold text-slate-900">{correctAnswer}</span>
            </p>
            {steps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {phase === "try_again" && (
        <button
          type="button"
          onClick={() => void send(true)}
          className="mt-3 text-sm font-semibold text-indigo-700 underline-offset-2 hover:underline"
        >
          Show me the answer
        </button>
      )}
    </div>
  );
}
