"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ConfirmDialog, EmptyState, ErrorBanner, Pill, Spinner } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import { navigate } from "@/lib/client/navigate";
import type { AttemptSummary, HomeworkHistory, SectionHistory, SectionScoreEntry } from "@/lib/learn/types";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function ScoreChip({ entry }: { entry: SectionScoreEntry }) {
  const pct = entry.percentage;
  const colour =
    pct === null
      ? "bg-slate-50 text-slate-700 ring-slate-200"
      : pct >= 80
        ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
        : pct >= 50
          ? "bg-sky-50 text-sky-900 ring-sky-200"
          : "bg-amber-50 text-amber-900 ring-amber-200";
  return (
    <Link
      href={`/learn/attempt/${entry.attemptId}`}
      className={`inline-flex flex-col rounded-xl px-3 py-1.5 text-xs ring-1 hover:opacity-80 ${colour}`}
      title="See the answers from this go"
    >
      <span className="font-bold">
        {entry.score}/{entry.total}
        {pct !== null && <span className="font-normal"> · {pct}%</span>}
      </span>
      <span className="opacity-80">{shortDate(entry.date)}</span>
    </Link>
  );
}

type SectionState = "not_started" | "in_progress" | "done";

export default function HomeworkOverview({ setId, studentId }: { setId: string; studentId: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<HomeworkHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toDiscard, setToDiscard] = useState<AttemptSummary | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ history: HomeworkHistory }>(`/api/learn/history?studentId=${studentId}&setId=${setId}`).then(
      (data) => {
        if (cancelled) return;
        setHistory(data.history);
        setError(null);
      },
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, [setId, studentId, reload]);

  async function start(sectionId: string | null) {
    setBusy(sectionId ?? "whole");
    setError(null);
    try {
      const data = await fetchJson<{ attemptId: string }>("/api/learn/attempts", {
        method: "POST",
        json: { studentId, homeworkSetId: setId, sectionId },
      });
      navigate(router, `/learn/attempt/${data.attemptId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function discard() {
    if (!toDiscard) return;
    setBusy(toDiscard.id);
    try {
      await fetchJson(`/api/learn/attempts/${toDiscard.id}`, { method: "DELETE" });
      setToDiscard(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
      setToDiscard(null);
    } finally {
      setBusy(null);
    }
  }

  if (!history) {
    return error ? <ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /> : <Spinner label="Loading your homework…" />;
  }

  const { homework, sections, attempts } = history;
  const open = attempts.filter((a) => a.status !== "completed");
  const openWhole = open.find((a) => a.sectionId === null);
  const wholeDone = attempts.filter((a) => a.sectionId === null && a.status === "completed");

  const stateOf = (s: SectionHistory): SectionState =>
    open.some((a) => a.sectionId === s.sectionId) ? "in_progress" : s.entries.length > 0 ? "done" : "not_started";
  const states = sections.map(stateOf);
  const doneCount = states.filter((x) => x === "done").length;
  // "Next up": a section already started, otherwise the first one not done yet.
  const nextIndex = states.indexOf("in_progress") >= 0 ? states.indexOf("in_progress") : states.indexOf("not_started");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/learn" className="text-sm font-semibold text-indigo-700 hover:underline">← All homework</Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{homework.title}</h1>
        <p className="text-slate-600">
          {history.student.displayName} · Year {homework.schoolYear}
          {homework.weekNumber ? ` · Week ${homework.weekNumber}` : ""}
          {homework.topic ? ` · ${homework.topic}` : ""}
        </p>
        <div className="mt-4 max-w-md">
          <div className="mb-1 flex justify-between text-sm font-medium text-slate-700">
            <span>{doneCount === sections.length && sections.length > 0 ? "All sections done! 🎉" : `${doneCount} of ${sections.length} sections done`}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={sections.length} aria-label="Sections done">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sections.length ? (doneCount / sections.length) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {sections.length === 0 ? (
        <EmptyState icon="📋" title="This homework has no sections yet" />
      ) : (
        <ol className="space-y-3">
          {sections.map((section, i) => {
            const state = states[i];
            const openAttempt = open.find((a) => a.sectionId === section.sectionId);
            const isNext = i === nextIndex;
            return (
              <li
                key={section.sectionId}
                className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${isNext ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold ${
                      state === "done" ? "bg-emerald-100 text-emerald-700" : isNext ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                    aria-hidden
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">{section.sectionTitle}</h2>
                      <Pill tone="indigo">{section.subject}</Pill>
                      {isNext && <Pill tone="blue">Next up</Pill>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {state === "not_started" && "Not started"}
                      {state === "in_progress" && "You're part way through"}
                      {state === "done" &&
                        `Latest ${section.latest}% · Best ${section.best}%${
                          section.entries.length > 1 && (section.latest ?? 0) > (section.entries[section.entries.length - 2].percentage ?? 0) ? " 📈 getting better!" : ""
                        }`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={state === "done" ? "secondary" : "primary"}
                      disabled={busy !== null}
                      onClick={() => void start(section.sectionId)}
                    >
                      {busy === section.sectionId
                        ? "Opening…"
                        : state === "in_progress"
                          ? "Carry on"
                          : state === "done"
                            ? "↻ Practise again"
                            : "Start"}
                    </Button>
                    {openAttempt && (
                      <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setToDiscard(openAttempt)}>
                        Discard
                      </Button>
                    )}
                  </div>
                </div>

                {section.entries.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-[3.25rem]">
                    <span className="text-xs font-semibold text-slate-500">Your scores:</span>
                    {section.entries.map((entry) => (
                      <ScoreChip key={entry.attemptId} entry={entry} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-700">Do all the sections in one go</summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void start(null)}>
            {busy === "whole" ? "Opening…" : openWhole ? "Carry on (all sections)" : "Start all sections"}
          </Button>
          {openWhole && (
            <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setToDiscard(openWhole)}>
              Discard
            </Button>
          )}
          {wholeDone.length > 0 && (
            <span className="text-slate-600">
              Done in one go {wholeDone.length} time{wholeDone.length === 1 ? "" : "s"} (best {Math.max(...wholeDone.map((a) => a.percentage ?? 0))}%)
            </span>
          )}
        </div>
      </details>

      <ConfirmDialog
        open={toDiscard !== null}
        title="Discard and start over?"
        confirmLabel="Discard"
        danger
        busy={busy === toDiscard?.id}
        onConfirm={() => void discard()}
        onCancel={() => setToDiscard(null)}
      >
        All the answers in this unfinished go will be deleted. Your finished scores are kept.
      </ConfirmDialog>
    </div>
  );
}
