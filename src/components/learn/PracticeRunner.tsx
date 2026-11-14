"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openOriginalFile } from "@/components/library/openOriginalFile";
import { Button, ConfirmDialog, ErrorBanner, Pill } from "@/components/ui";
import { ApiClientError, errorMessage, fetchJson } from "@/lib/client/fetchJson";
import type { AttemptProgress, AttemptView, PracticeQuestionView } from "@/lib/learn/types";
import AnswerInput from "./AnswerInput";

interface Props {
  attempt: AttemptView;
  onMarked: (attempt: AttemptView) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface FlatQuestion {
  question: PracticeQuestionView;
  sectionIndex: number;
}

const isAnswerable = (q: PracticeQuestionView) => q.questionType !== "not_digital";

export default function PracticeRunner({ attempt, onMarked }: Props) {
  const flat = useMemo<FlatQuestion[]>(
    () => attempt.sections.flatMap((s, sectionIndex) => s.questions.map((question) => ({ question, sectionIndex }))),
    [attempt.sections]
  );

  const initialIndex = Math.max(0, flat.findIndex((f) => f.question.id === attempt.progress.currentQuestionId));
  const [index, setIndex] = useState(initialIndex);
  const [reviewing, setReviewing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers);
  const [submittedSections, setSubmittedSections] = useState<string[]>(attempt.progress.submittedSections);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmHandIn, setConfirmHandIn] = useState(false);
  const [marking, setMarking] = useState(false);

  const pending = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<AttemptProgress>(attempt.progress);

  const current = flat[index];
  const section = current ? attempt.sections[current.sectionIndex] : null;
  const answerable = flat.filter((f) => isAnswerable(f.question));
  const answeredCount = answerable.filter((f) => answers[f.question.id]?.trim()).length;
  const unanswered = answerable.filter((f) => !answers[f.question.id]?.trim());

  /** Saves pending answers and the current position. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current.entries()].map(([questionId, answer]) => ({ questionId, answer }));
    pending.current.clear();
    setSaveState("saving");
    try {
      await fetchJson(`/api/learn/attempts/${attempt.id}/answers`, {
        method: "PUT",
        json: { answers: batch, progress: progressRef.current },
      });
      setSaveState("saved");
      return true;
    } catch (err) {
      // Put the answers back so they're retried on the next save.
      for (const { questionId, answer } of batch) if (!pending.current.has(questionId)) pending.current.set(questionId, answer);
      setSaveState("error");
      setError(errorMessage(err));
      return false;
    }
  }, [attempt.id]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1500);
  }, [flush]);

  // Save when the page is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (pending.current.size > 0) void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    pending.current.set(questionId, value);
    setSaveState("idle");
    scheduleSave();
  }

  function goTo(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), flat.length - 1);
    setIndex(clamped);
    setReviewing(false);
    progressRef.current = { ...progressRef.current, currentQuestionId: flat[clamped]?.question.id ?? null };
    void flush();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishSection() {
    if (!section) return;
    const next = submittedSections.includes(section.id) ? submittedSections : [...submittedSections, section.id];
    setSubmittedSections(next);
    progressRef.current = { ...progressRef.current, submittedSections: next };
    const nextSectionStart = flat.findIndex((f) => f.sectionIndex === current.sectionIndex + 1);
    if (nextSectionStart >= 0) goTo(nextSectionStart);
    else {
      void flush();
      setReviewing(true);
    }
  }

  async function handIn() {
    setConfirmHandIn(false);
    setMarking(true);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    const finalAnswers = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
    pending.current.clear();

    try {
      const data = await fetchJson<{ attempt: AttemptView }>(`/api/learn/attempts/${attempt.id}/submit`, {
        method: "POST",
        json: { answers: finalAnswers },
      });
      onMarked(data.attempt);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "marking_in_progress") {
        // Another tab is marking: wait for it to finish.
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const data = await fetchJson<{ attempt: AttemptView }>(`/api/learn/attempts/${attempt.id}`);
            if (data.attempt.status === "completed") return onMarked(data.attempt);
          } catch {
            /* keep waiting */
          }
        }
      }
      setError(errorMessage(err));
      setMarking(false);
    }
  }

  if (marking) {
    return (
      <div aria-live="polite" aria-busy="true" className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div aria-hidden className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
        <h2 className="text-xl font-bold text-slate-900">Marking your homework…</h2>
        <p className="mt-2 text-slate-600">Homework Buddy is checking every answer and writing explanations. This can take up to a minute.</p>
      </div>
    );
  }

  const percent = answerable.length ? Math.round((answeredCount / answerable.length) * 100) : 0;
  const sectionQuestions = current ? flat.filter((f) => f.sectionIndex === current.sectionIndex) : [];
  const isLastInSection = current && sectionQuestions[sectionQuestions.length - 1]?.question.id === current.question.id;
  const showStem = current?.question.data.parentText && (index === 0 || flat[index - 1].question.data.parentNumber !== current.question.data.parentNumber || flat[index - 1].sectionIndex !== current.sectionIndex);

  return (
    <div className="space-y-5">
      {/* Header + progress */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/learn" className="text-sm font-semibold text-indigo-700 hover:underline">← My homework</Link>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{attempt.homework.title}</h1>
            <p className="text-sm text-slate-600">
              Year {attempt.homework.schoolYear} · Week {attempt.homework.weekNumber} · {attempt.student.displayName}
            </p>
          </div>
          <span className="text-sm text-slate-500" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : saveState === "error" ? "Not saved yet" : ""}
          </span>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm font-medium text-slate-600">
            <span>{answeredCount} of {answerable.length} answered</span>
            <span>{percent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Homework progress">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {/* Section navigation */}
        <nav aria-label="Sections" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {attempt.sections.map((s, i) => {
            const qs = s.questions.filter(isAnswerable);
            const done = qs.filter((q) => answers[q.id]?.trim()).length;
            const active = !reviewing && current?.sectionIndex === i;
            const finished = submittedSections.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => goTo(flat.findIndex((f) => f.sectionIndex === i))}
                className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  active ? "bg-indigo-600 text-white" : finished ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <span className="block max-w-[11rem] truncate">{finished ? "✓ " : ""}{s.sectionTitle}</span>
                <span className="font-normal opacity-80">{done}/{qs.length}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              void flush();
              setReviewing(true);
            }}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ${reviewing ? "bg-indigo-600 text-white" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}
          >
            Review &amp; hand in
          </button>
        </nav>
      </div>

      {error && <ErrorBanner message={error} />}

      {reviewing ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Ready to hand in?</h2>
          {unanswered.length === 0 ? (
            <p className="mt-2 text-lg text-emerald-700">🎉 You&apos;ve answered every question!</p>
          ) : (
            <>
              <p className="mt-2 text-slate-700">
                You still have <strong>{unanswered.length}</strong> question{unanswered.length === 1 ? "" : "s"} to answer. Tap one to go back to it:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {unanswered.map((f) => (
                  <li key={f.question.id}>
                    <button
                      type="button"
                      onClick={() => goTo(flat.indexOf(f))}
                      className="rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {attempt.sections[f.sectionIndex].sectionTitle.slice(0, 24)} · Q{f.question.questionNumber}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => (unanswered.length ? setConfirmHandIn(true) : void handIn())}>
              Hand in my homework
            </Button>
            <Button size="lg" variant="secondary" onClick={() => goTo(index)}>Keep working</Button>
          </div>
        </div>
      ) : current && section ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="indigo">{section.subject}</Pill>
            <h2 className="text-lg font-bold text-slate-900">{section.sectionTitle}</h2>
          </div>
          {section.instructions && (
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">{section.instructions}</p>
          )}
          {showStem && (
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-indigo-50/70 px-4 py-3 text-slate-800">{current.question.data.parentText}</p>
          )}

          <div className="mt-6 flex items-start gap-3">
            <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 px-2 text-base font-bold text-white">
              {current.question.questionNumber}
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-line text-xl font-medium leading-relaxed text-slate-900">{current.question.questionText}</p>
              {current.question.marks > 1 && <p className="mt-1 text-sm text-slate-500">{current.question.marks} marks</p>}
            </div>
          </div>

          {current.question.data.visualReference && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <span>🖼️ Look at the worksheet: {current.question.data.visualReference}</span>
              {attempt.homework.hasFile && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openOriginalFile(attempt.homework.id, current.question.data.page).catch((e) => setError(errorMessage(e)))}
                >
                  Open the worksheet{current.question.data.page ? ` (page ${current.question.data.page})` : ""}
                </Button>
              )}
            </div>
          )}

          <div className="mt-6">
            <AnswerInput
              key={current.question.id}
              question={current.question}
              value={answers[current.question.id] ?? ""}
              onChange={(v) => setAnswer(current.question.id, v)}
            />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button size="lg" variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
              ← Previous
            </Button>
            <span className="text-sm text-slate-500">Question {index + 1} of {flat.length}</span>
            {isLastInSection ? (
              <Button size="lg" onClick={finishSection}>
                {current.sectionIndex === attempt.sections.length - 1 ? "Finish & review" : "Finish section →"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => goTo(index + 1)}>Next →</Button>
            )}
          </div>
        </div>
      ) : (
        <ErrorBanner message="This homework has no questions yet." />
      )}

      <ConfirmDialog
        open={confirmHandIn}
        title="Hand in now?"
        confirmLabel="Hand in anyway"
        onConfirm={() => void handIn()}
        onCancel={() => setConfirmHandIn(false)}
      >
        You haven&apos;t answered {unanswered.length} question{unanswered.length === 1 ? "" : "s"}. They&apos;ll be marked as not answered. You can still go back and answer them first.
      </ConfirmDialog>
    </div>
  );
}
