"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openOriginalFile } from "@/components/library/openOriginalFile";
import MicButton from "@/components/speech/MicButton";
import { ReadAloudButton, useSpeech } from "@/components/speech/SpeechProvider";
import { Button, ConfirmDialog, ErrorBanner, Pill } from "@/components/ui";
import { ApiClientError, errorMessage, fetchJson } from "@/lib/client/fetchJson";
import { navigate } from "@/lib/client/navigate";
import { groupQuestions, partLabel, type QuestionGroup } from "@/lib/learn/grouping";
import { findSpellingList, isDictionarySection, isSingleWordStem } from "@/lib/learn/spelling";
import type { AttemptProgress, AttemptView, CheckView, PracticeQuestionView } from "@/lib/learn/types";
import AnswerInput from "./AnswerInput";
import AskAboutQuestion from "./AskAboutQuestion";
import CheckFeedback, { checkToSpeech } from "./CheckFeedback";
import QuestionFigure from "./QuestionFigure";
import SpellingDictation from "./SpellingDictation";

interface Props {
  attempt: AttemptView;
  onMarked: (attempt: AttemptView) => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** One screen = one main question with all of its sub-questions. */
interface Screen {
  sectionIndex: number;
  group: QuestionGroup<PracticeQuestionView>;
}

const isAnswerable = (q: PracticeQuestionView) => q.questionType !== "not_digital";
/** Answers a child can say instead of type. */
const isSpeakable = (q: PracticeQuestionView) => q.questionType === "short_text" || q.questionType === "long_text";

export default function PracticeRunner({ attempt, onMarked }: Props) {
  const screens = useMemo<Screen[]>(
    () => attempt.sections.flatMap((s, sectionIndex) => groupQuestions(s.questions).map((group) => ({ sectionIndex, group }))),
    [attempt.sections]
  );
  const screenOf = useCallback(
    (questionId: string | null) => Math.max(0, screens.findIndex((sc) => sc.group.parts.some((p) => p.id === questionId))),
    [screens]
  );

  const [index, setIndex] = useState(() => screenOf(attempt.progress.currentQuestionId));
  const [reviewing, setReviewing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers);
  const [submittedSections, setSubmittedSections] = useState<string[]>(attempt.progress.submittedSections);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmHandIn, setConfirmHandIn] = useState(false);
  const [marking, setMarking] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, CheckView>>(attempt.checks);
  const [checking, setChecking] = useState(false);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const speech = useSpeech();

  const pending = useRef(new Map<string, string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<AttemptProgress>(attempt.progress);

  const current = screens[index];
  const section = current ? attempt.sections[current.sectionIndex] : null;
  const allQuestions = attempt.sections.flatMap((s) => s.questions).filter(isAnswerable);
  const answeredCount = allQuestions.filter((q) => answers[q.id]?.trim()).length;
  const unanswered = screens
    .map((sc, i) => ({ i, sc, missing: sc.group.parts.filter((p) => isAnswerable(p) && !answers[p.id]?.trim()).length }))
    .filter((x) => x.missing > 0);
  const unansweredCount = allQuestions.length - answeredCount;

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
    const clamped = Math.min(Math.max(nextIndex, 0), screens.length - 1);
    setIndex(clamped);
    setReviewing(false);
    setCheckNotice(null);
    speech.stop();
    progressRef.current = { ...progressRef.current, currentQuestionId: screens[clamped]?.group.parts[0]?.id ?? null };
    void flush();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishSection() {
    if (!section || !current) return;
    const next = submittedSections.includes(section.id) ? submittedSections : [...submittedSections, section.id];
    setSubmittedSections(next);
    progressRef.current = { ...progressRef.current, submittedSections: next };
    const nextSectionStart = screens.findIndex((sc) => sc.sectionIndex === current.sectionIndex + 1);
    if (nextSectionStart >= 0) goTo(nextSectionStart);
    else {
      void flush();
      setReviewing(true);
    }
  }

  const isLocked = (q: PracticeQuestionView) => {
    const state = checks[q.id]?.state;
    return state === "correct" || state === "revealed" || state === "needs_review";
  };

  /** Checks the answers on the current screen (one main question). */
  async function checkScreen() {
    if (!current) return;
    const parts = current.group.parts.filter((p) => isAnswerable(p) && !isLocked(p));
    const filled = parts.filter((p) => answers[p.id]?.trim());
    if (filled.length === 0) {
      setCheckNotice("Type an answer first, then check it.");
      return;
    }
    setChecking(true);
    setCheckNotice(null);
    setError(null);
    filled.forEach((p) => pending.current.delete(p.id)); // the check saves these answers
    try {
      const data = await fetchJson<{ checks: CheckView[] }>(`/api/learn/attempts/${attempt.id}/check`, {
        method: "POST",
        json: { answers: filled.map((p) => ({ questionId: p.id, answer: answers[p.id] })) },
      });
      setChecks((prev) => ({ ...prev, ...Object.fromEntries(data.checks.map((c) => [c.questionId, c])) }));
      if (speech.autoRead && data.checks.length > 0) {
        const multiPart = current.group.parts.length > 1;
        const lines = current.group.parts.flatMap((p, i) => {
          const view = data.checks.find((c) => c.questionId === p.id);
          if (!view) return [];
          return [...(multiPart ? [`Part ${partLabel(current.group, i, p)}.`] : []), ...checkToSpeech(view)];
        });
        speech.speak(lines, `screen-${index}-feedback`);
      }
      const left = parts.length - filled.length;
      if (left > 0) setCheckNotice(`${left} part${left === 1 ? " is" : "s are"} still empty - have a go and check again.`);
      void flush(); // saves position
    } catch (err) {
      filled.forEach((p) => pending.current.set(p.id, answers[p.id]));
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  async function discard() {
    setDiscarding(true);
    if (timer.current) clearTimeout(timer.current);
    pending.current.clear();
    try {
      await fetchJson(`/api/learn/attempts/${attempt.id}`, { method: "DELETE" });
      navigate(router, `/learn/homework/${attempt.homework.id}?student=${attempt.student.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setDiscarding(false);
      setConfirmDiscard(false);
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

  const percent = allQuestions.length ? Math.round((answeredCount / allQuestions.length) * 100) : 0;
  const sectionScreens = current ? screens.filter((sc) => sc.sectionIndex === current.sectionIndex) : [];
  const isLastInSection = current && sectionScreens[sectionScreens.length - 1] === current;
  const group = current?.group;
  const multi = (group?.parts.length ?? 0) > 1;
  // One "open the worksheet" button per screen, at the first page any part refers to.
  // Pictures: one shared picture (table, house) is shown once; otherwise each part shows its own.
  const figureUrls = group?.parts.map((p) => p.figureUrl) ?? [];
  const sharedFigure = figureUrls.length > 1 && figureUrls[0] && figureUrls.every((u) => u === figureUrls[0]) ? figureUrls[0] : null;
  const singleFigure = group && group.parts.length === 1 ? group.parts[0].figureUrl : null;
  // Fallback for pictures that couldn't be cropped: link to the original sheet.
  const visualPart = group?.parts.find((p) => p.data.visualReference && !p.figureUrl);
  const answerableParts = group?.parts.filter(isAnswerable) ?? [];
  const canCheck = answerableParts.some((p) => !isLocked(p));
  const screenDone = answerableParts.length > 0 && answerableParts.every(isLocked);
  // Voice: spelling lists become a read-aloud test; one-word stems (dictionary work) can be heard.
  const spelling =
    group && section && group.parts.length === 1
      ? findSpellingList({
          questionText: group.parts[0].questionText,
          questionType: group.parts[0].questionType,
          topic: group.parts[0].data.topic,
          sectionTitle: section.sectionTitle,
          instructions: section.instructions,
        })
      : null;
  const wordStem = group && isSingleWordStem(group.stem) ? group.stem.trim() : null;
  const dictionary = !!section && isDictionarySection(section.sectionTitle, section.instructions);
  const questionSpeech = group
    ? [group.stem ?? "", ...group.parts.map((p, i) => (multi ? `${partLabel(group, i, p)}. ${p.questionText}` : p.questionText))].filter(Boolean)
    : [];

  const answerExtras = (part: PracticeQuestionView) => (
    <>
      {isSpeakable(part) && !isLocked(part) && (
        <div className="mt-2">
          <MicButton
            disabled={checking}
            label={part.questionType === "long_text" ? "Say your answer" : "Say it"}
            onText={(text) => {
              const before = answers[part.id]?.trim();
              setAnswer(part.id, before ? `${before} ${text}` : text);
            }}
          />
        </div>
      )}
      {checks[part.id] && <CheckFeedback check={checks[part.id]} />}
      {checks[part.id] && checks[part.id].state !== "needs_review" && (
        <AskAboutQuestion key={part.id} attemptId={attempt.id} questionId={part.id} />
      )}
    </>
  );

  return (
    <div className="space-y-5">
      {/* Header + progress */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/learn/homework/${attempt.homework.id}?student=${attempt.student.id}`} className="text-sm font-semibold text-indigo-700 hover:underline">← All sections</Link>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{attempt.homework.title}</h1>
            <p className="text-sm text-slate-600">
              Year {attempt.homework.schoolYear}
              {attempt.homework.weekNumber ? ` · Week ${attempt.homework.weekNumber}` : ""}
              {attempt.homework.topic ? ` · ${attempt.homework.topic}` : ""} · {attempt.student.displayName}
            </p>
            {attempt.scope && (
              <p className="mt-1">
                <Pill tone="blue">Section: {attempt.scope.sectionTitle}</Pill>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm text-slate-500" aria-live="polite">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : saveState === "error" ? "Not saved yet" : ""}
            </span>
            {speech.supported && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-indigo-600"
                  checked={speech.autoRead}
                  onChange={(e) => {
                    speech.setAutoRead(e.target.checked);
                    if (!e.target.checked) speech.stop();
                  }}
                />
                🔊 Read feedback aloud
              </label>
            )}
            <button type="button" onClick={() => setConfirmDiscard(true)} className="text-xs font-semibold text-rose-700 hover:underline">
              Discard and start over
            </button>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm font-medium text-slate-600">
            <span>{answeredCount} of {allQuestions.length} answers done</span>
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
                onClick={() => goTo(screens.findIndex((sc) => sc.sectionIndex === i))}
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
          <h2 className="text-xl font-bold text-slate-900">{attempt.scope ? "Finished this section?" : "Ready to hand in?"}</h2>
          {unansweredCount === 0 ? (
            <p className="mt-2 text-lg text-emerald-700">🎉 You&apos;ve answered every question!</p>
          ) : (
            <>
              <p className="mt-2 text-slate-700">
                You still have <strong>{unansweredCount}</strong> answer{unansweredCount === 1 ? "" : "s"} to fill in. Tap a question to go back to it:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {unanswered.map(({ i, sc, missing }) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      className="rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {attempt.sections[sc.sectionIndex].sectionTitle.slice(0, 24)} · Q{sc.group.label}
                      {sc.group.parts.length > 1 && <span className="font-normal"> ({missing} left)</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => (unansweredCount ? setConfirmHandIn(true) : void handIn())}>
              {attempt.scope ? "Hand in this section" : "Hand in my homework"}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => goTo(index)}>Keep working</Button>
          </div>
        </div>
      ) : current && section && group ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="indigo">{section.subject}</Pill>
            <h2 className="text-lg font-bold text-slate-900">{section.sectionTitle}</h2>
          </div>
          {(spelling ? spelling.intro : section.instructions) && (
            <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-3 text-slate-700">{spelling ? spelling.intro : section.instructions}</p>
          )}

          {/* Main question: number + shared instruction/data */}
          <div className="mt-6 flex items-start gap-3">
            <span className="grid h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 px-2 text-lg font-bold text-white">
              {group.label}
            </span>
            <div className="min-w-0 flex-1">
              {spelling ? (
                <p className="text-xl font-medium leading-relaxed text-slate-900">Learn your {spelling.words.length} spellings</p>
              ) : wordStem ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-3xl font-bold text-slate-900">{wordStem}</p>
                  <ReadAloudButton text={wordStem} id={`word-${group.label}`} label="Hear the word" className="!text-base ring-1 ring-indigo-200" />
                  <ReadAloudButton text={wordStem} id={`word-slow-${group.label}`} label="Slowly" rate={0.6} />
                </div>
              ) : multi ? (
                group.stem && <p className="whitespace-pre-line text-xl font-medium leading-relaxed text-slate-900">{group.stem}</p>
              ) : (
                <>
                  {group.stem && <p className="mb-2 whitespace-pre-line rounded-2xl bg-indigo-50/70 px-4 py-3 text-slate-800">{group.stem}</p>}
                  <p className="whitespace-pre-line text-xl font-medium leading-relaxed text-slate-900">{group.parts[0].questionText}</p>
                  {group.parts[0].marks > 1 && <p className="mt-1 text-sm text-slate-500">{group.parts[0].marks} marks</p>}
                </>
              )}
              {multi && <p className="mt-1 text-sm text-slate-500">{group.parts.length} parts</p>}
              {wordStem && dictionary && (
                <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sky-900 ring-1 ring-sky-200">
                  ✏️ Write <strong>{wordStem}</strong> on your paper, look it up in your dictionary, then answer below.
                </p>
              )}
              {!spelling && !wordStem && <ReadAloudButton text={questionSpeech} id={`question-${index}`} label="Read the question" className="-ml-2 mt-1" />}
            </div>
          </div>

          {visualPart && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <span>🖼️ Part of this question uses a picture on your worksheet{visualPart.data.page ? ` (page ${visualPart.data.page})` : ""}.</span>
              {attempt.homework.hasFile && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openOriginalFile(attempt.homework.id, visualPart.data.page).catch((e) => setError(errorMessage(e)))}
                >
                  Open the worksheet
                </Button>
              )}
            </div>
          )}

          {(sharedFigure || singleFigure) && (
            <div className="mt-5">
              <QuestionFigure src={(sharedFigure || singleFigure)!} alt={`Picture for question ${group.label}`} size="lg" />
            </div>
          )}

          {/* Sub-questions (or the single answer box) */}
          {multi ? (
            <ol className="mt-6 space-y-4">
              {group.parts.map((part, i) => (
                <li key={part.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                      {partLabel(group, i, part)}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="whitespace-pre-line text-lg text-slate-900">{part.questionText}</p>
                      {part.data.visualReference && !part.figureUrl && <p className="mt-1 text-sm text-sky-800">Look at: {part.data.visualReference}</p>}
                    </div>
                  </div>
                  {part.figureUrl && !sharedFigure && (
                    <div className="mb-3">
                      <QuestionFigure src={part.figureUrl} alt={`Picture for ${group.label}${partLabel(group, i, part)}`} />
                    </div>
                  )}
                  <AnswerInput question={part} value={answers[part.id] ?? ""} onChange={(v) => setAnswer(part.id, v)} disabled={isLocked(part) || checking} />
                  {answerExtras(part)}
                </li>
              ))}
            </ol>
          ) : spelling ? (
            <div className="mt-6">
              <SpellingDictation key={group.parts[0].id} id={group.parts[0].id} list={spelling} />
            </div>
          ) : (
            <div className="mt-6">
              {group.parts[0].data.visualReference && !group.parts[0].figureUrl && (
                <p className="mb-3 text-sm text-sky-800">Look at: {group.parts[0].data.visualReference}</p>
              )}
              <AnswerInput
                key={group.parts[0].id}
                question={group.parts[0]}
                value={answers[group.parts[0].id] ?? ""}
                onChange={(v) => setAnswer(group.parts[0].id, v)}
                disabled={isLocked(group.parts[0]) || checking}
              />
              {answerExtras(group.parts[0])}
            </div>
          )}

          {canCheck && (
            <div className="mt-6 flex flex-col items-start gap-2">
              <Button size="lg" variant="secondary" disabled={checking} onClick={() => void checkScreen()} className="!ring-2 !ring-indigo-300">
                {checking ? "Checking…" : multi ? "✓ Check my answers" : "✓ Check my answer"}
              </Button>
              {checkNotice && <p className="text-sm font-medium text-amber-800" aria-live="polite">{checkNotice}</p>}
            </div>
          )}
          {!canCheck && screenDone && (
            <p className="mt-6 rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-900">🎉 All done on this question - press Next!</p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <Button size="lg" variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
              ← Previous
            </Button>
            <span className="text-sm text-slate-500">Question {index + 1} of {screens.length}</span>
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
        open={confirmDiscard}
        title="Discard this attempt?"
        confirmLabel="Discard"
        danger
        busy={discarding}
        onConfirm={() => void discard()}
        onCancel={() => setConfirmDiscard(false)}
      >
        All your answers in this attempt will be deleted and you can start again. Scores from finished attempts are kept.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmHandIn}
        title="Hand in now?"
        confirmLabel="Hand in anyway"
        onConfirm={() => void handIn()}
        onCancel={() => setConfirmHandIn(false)}
      >
        You haven&apos;t filled in {unansweredCount} answer{unansweredCount === 1 ? "" : "s"}. They&apos;ll be marked as not answered. You can still go back and answer them first.
      </ConfirmDialog>
    </div>
  );
}
