"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PracticeQuestion from "@/components/homework/PracticeQuestion";
import { Button, ErrorBanner, Pill } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import type { PublicPracticeQuestion } from "@/lib/homework/types";
import type { AttemptView, MarkingStatus, PracticeQuestionView, QuestionResult } from "@/lib/learn/types";
import { SECTION_SUBJECTS } from "@/lib/library/types";

const STATUS: Record<MarkingStatus, { label: string; icon: string; tone: "green" | "red" | "blue" | "slate" | "amber"; border: string }> = {
  correct: { label: "Correct", icon: "✓", tone: "green", border: "border-l-emerald-500" },
  incorrect: { label: "Not quite", icon: "✗", tone: "red", border: "border-l-rose-500" },
  partially_correct: { label: "Partly right", icon: "◐", tone: "blue", border: "border-l-sky-500" },
  unanswered: { label: "Not answered", icon: "–", tone: "slate", border: "border-l-slate-400" },
  needs_review: { label: "Needs checking", icon: "?", tone: "amber", border: "border-l-amber-500" },
};

type Filter = "all" | MarkingStatus;

function SimilarPractice({ attemptId, questionId }: { attemptId: string; questionId: string }) {
  const [practice, setPractice] = useState<PublicPracticeQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ practice: PublicPracticeQuestion }>(`/api/learn/attempts/${attemptId}/similar`, {
        method: "POST",
        json: { questionId },
      });
      setPractice(data.practice);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (practice) {
    return (
      <div className="space-y-2">
        <PracticeQuestion key={practice.token} practice={practice} onFinished={() => undefined} />
        <Button variant="ghost" size="sm" onClick={() => void generate()} disabled={busy}>
          {busy ? "Thinking…" : "↻ Give me another one"}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={() => void generate()} disabled={busy}>
        {busy ? "Making a question…" : "🎯 Practice a Similar Question"}
      </Button>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

function ResultCard({ q, result, attemptId }: { q: PracticeQuestionView; result: QuestionResult | undefined; attemptId: string }) {
  if (q.questionType === "not_digital") {
    return (
      <article className="rounded-2xl border border-l-4 border-slate-200 border-l-sky-300 bg-white p-4">
        <p className="text-sm text-slate-500">Q{q.questionNumber} · done on paper</p>
        <p className="mt-1 text-slate-800">{q.questionText}</p>
      </article>
    );
  }
  if (!result) return null;
  const s = STATUS[result.status];
  const showAnswer = result.status !== "correct" && result.correctAnswer;
  const canPractise = result.status === "incorrect" || result.status === "partially_correct";

  return (
    <article className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${s.border}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-slate-100 px-2 text-sm font-bold text-slate-700">{q.questionNumber}</span>
          <div className="min-w-0">
            {q.data.parentText && <p className="text-sm text-slate-500 line-clamp-2">{q.data.parentText}</p>}
            <h4 className="whitespace-pre-line break-words text-base font-semibold text-slate-900 sm:text-lg">{q.questionText}</h4>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={s.tone}>{s.icon} {s.label}</Pill>
          <span className="text-sm font-semibold text-slate-600">{result.status === "needs_review" ? "–" : result.awardedMarks}/{result.marks}</span>
        </div>
      </header>

      <dl className={`mt-4 grid gap-3 ${showAnswer ? "sm:grid-cols-2" : ""}`}>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your answer</dt>
          <dd className={`mt-1 break-words font-medium ${result.studentAnswer ? "text-slate-900" : "italic text-slate-400"}`}>
            {result.studentAnswer ?? "No answer"}
          </dd>
        </div>
        {showAnswer && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Correct answer</dt>
            <dd className="mt-1 break-words font-semibold text-emerald-900">{result.correctAnswer}</dd>
          </div>
        )}
      </dl>

      {result.feedback && <p className="mt-4 font-medium text-slate-800">{result.feedback}</p>}
      {result.explanation && result.explanation !== result.feedback && <p className="mt-1 text-slate-700">{result.explanation}</p>}

      {result.workingSteps.length > 0 && (
        <details className="group mt-3" open={result.status !== "correct"}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-indigo-700">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span> Let&apos;s work it out
          </summary>
          <ol className="mt-2 space-y-2">
            {result.workingSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {canPractise && (
        <div className="mt-4">
          <SimilarPractice attemptId={attemptId} questionId={q.id} />
        </div>
      )}
    </article>
  );
}

export default function AttemptResults({ attempt }: { attempt: AttemptView }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const results = attempt.results ?? {};
  const score = attempt.score;
  const pct = score?.percentage ?? null;

  const headline =
    pct === null ? "All handed in!" : pct >= 90 ? "Amazing work! 🌟" : pct >= 70 ? "Great job! 🎉" : pct >= 40 ? "Good effort! 💪" : "Good try - let's learn together! 📚";

  async function practiseAgain() {
    setRestarting(true);
    try {
      const data = await fetchJson<{ attemptId: string }>("/api/learn/attempts", {
        method: "POST",
        json: { studentId: attempt.student.id, homeworkSetId: attempt.homework.id },
      });
      router.push(`/learn/attempt/${data.attemptId}`);
    } catch (err) {
      setError(errorMessage(err));
      setRestarting(false);
    }
  }

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: Object.keys(results).length },
    { value: "correct", label: "Correct", count: score?.counts.correct ?? 0 },
    { value: "incorrect", label: "Not quite", count: score?.counts.incorrect ?? 0 },
    { value: "partially_correct", label: "Partly right", count: score?.counts.partially_correct ?? 0 },
    { value: "unanswered", label: "Not answered", count: score?.counts.unanswered ?? 0 },
    { value: "needs_review", label: "Needs checking", count: score?.counts.needs_review ?? 0 },
  ];

  const visible = (q: PracticeQuestionView) =>
    filter === "all" ? true : q.questionType !== "not_digital" && results[q.id]?.status === filter;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <Link href="/learn" className="text-sm font-semibold text-indigo-700 hover:underline">← My homework</Link>
        <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-indigo-50 ring-8 ring-indigo-100">
            <div className="text-center">
              <p className="text-3xl font-bold text-indigo-800">{pct === null ? "–" : `${Math.round(pct)}%`}</p>
              <p className="text-sm font-semibold text-indigo-700">{score ? `${score.score} / ${score.totalMarks}` : ""}</p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">
              {attempt.homework.title} · Year {attempt.homework.schoolYear} · Week {attempt.homework.weekNumber}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{headline}</h1>
            <p className="mt-2 text-slate-600">
              {attempt.student.displayName}, you scored <strong>{score?.score ?? 0}</strong> out of <strong>{score?.totalMarks ?? 0}</strong> marks.
              {score && score.counts.needs_review > 0 && " A grown-up will check the questions marked “needs checking”."}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Correct", score?.counts.correct, "bg-emerald-50 text-emerald-800"],
            ["Not quite", score?.counts.incorrect, "bg-rose-50 text-rose-800"],
            ["Partly right", score?.counts.partially_correct, "bg-sky-50 text-sky-900"],
            ["Not answered", score?.counts.unanswered, "bg-slate-50 text-slate-800"],
            ["Needs checking", score?.counts.needs_review, "bg-amber-50 text-amber-900"],
          ].map(([label, value, cls]) => (
            <div key={label as string} className={`rounded-2xl px-4 py-3 ${cls}`}>
              <dt className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</dt>
              <dd className="mt-1 text-2xl font-bold">{value ?? 0}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setFilter("incorrect")} disabled={!score?.counts.incorrect && !score?.counts.partially_correct}>
            Practise my mistakes
          </Button>
          <Button variant="secondary" onClick={() => void practiseAgain()} disabled={restarting}>
            {restarting ? "Starting…" : "Do this homework again"}
          </Button>
        </div>
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      </section>

      <div role="group" aria-label="Filter results" className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              filter === f.value ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f.label} <span className="opacity-75">({f.count})</span>
          </button>
        ))}
      </div>

      {SECTION_SUBJECTS.map((subject) => {
        const sections = attempt.sections.filter((s) => s.subject === subject);
        if (sections.length === 0) return null;
        const subjectResults = sections.flatMap((s) => s.questions.map((q) => results[q.id]).filter(Boolean));
        const got = subjectResults.reduce((n, r) => n + (r.status === "needs_review" ? 0 : r.awardedMarks), 0);
        const total = subjectResults.reduce((n, r) => n + (r.status === "needs_review" ? 0 : r.marks), 0);
        const anyVisible = sections.some((s) => s.questions.some(visible));
        if (!anyVisible) return null;

        return (
          <section key={subject} className="space-y-4">
            <h2 className="flex items-baseline gap-3 text-2xl font-bold text-slate-900">
              {subject === "Maths" ? "🔢" : "📖"} {subject}
              <span className="text-base font-semibold text-slate-500">{got}/{total} marks</span>
            </h2>
            {sections.map((section) => {
              const questions = section.questions.filter(visible);
              if (questions.length === 0) return null;
              const sr = section.questions.map((q) => results[q.id]).filter(Boolean);
              return (
                <div key={section.id} className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-800">
                    {section.sectionTitle}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      ({sr.reduce((n, r) => n + (r.status === "needs_review" ? 0 : r.awardedMarks), 0)}/{sr.reduce((n, r) => n + (r.status === "needs_review" ? 0 : r.marks), 0)})
                    </span>
                  </h3>
                  {questions.map((q) => (
                    <ResultCard key={q.id} q={q} result={results[q.id]} attemptId={attempt.id} />
                  ))}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
