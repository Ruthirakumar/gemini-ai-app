"use client";

import { Button, Field, inputClass, Pill } from "@/components/ui";
import { EditorQuestion, QUESTION_TYPE_LABELS, QUESTION_TYPES, QuestionType } from "@/lib/library/types";

export type KeyedQuestion = EditorQuestion & { key: string };

interface Props {
  question: KeyedQuestion;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: KeyedQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  sectionOptions: { key: string; title: string }[];
  currentSectionKey: string;
  onMoveToSection: (sectionKey: string) => void;
  isFirst: boolean;
  isLast: boolean;
  /** Signed URL for questionData.figurePath, if it has a picture. */
  figureUrl?: string | null;
}

const lines = (value: string[]) => value.join("\n");
const fromLines = (value: string) => value.split("\n").map((v) => v.trim()).filter(Boolean);

export default function QuestionEditor({
  question: q,
  expanded,
  onToggle,
  onChange,
  onMove,
  onDelete,
  sectionOptions,
  currentSectionKey,
  onMoveToSection,
  isFirst,
  isLast,
  figureUrl,
}: Props) {
  const set = <K extends keyof KeyedQuestion>(key: K, value: KeyedQuestion[K]) => onChange({ ...q, [key]: value });
  const setData = <K extends keyof KeyedQuestion["questionData"]>(key: K, value: KeyedQuestion["questionData"][K]) =>
    onChange({ ...q, questionData: { ...q.questionData, [key]: value } });
  const setCriteria = <K extends keyof KeyedQuestion["markingCriteria"]>(key: K, value: KeyedQuestion["markingCriteria"][K]) =>
    onChange({ ...q, markingCriteria: { ...q.markingCriteria, [key]: value } });

  const notDigital = q.questionType === "not_digital";
  const missingAnswer = !notDigital && !q.markingCriteria.expectedAnswer.trim();

  return (
    <li className={`rounded-2xl border bg-white ${q.needsReview ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}>
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-slate-100 px-2 text-sm font-bold text-slate-700">
          {q.questionNumber || "?"}
        </span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <p className={`text-sm text-slate-900 ${expanded ? "" : "line-clamp-2"}`}>{q.questionText || <em className="text-slate-400">No question text</em>}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill tone="slate">{QUESTION_TYPE_LABELS[q.questionType]}</Pill>
            <Pill tone="indigo">{q.marks} mark{q.marks === 1 ? "" : "s"}</Pill>
            {!notDigital && (
              <span className="text-xs text-slate-500">
                Answer: <strong className={missingAnswer ? "text-rose-700" : "text-slate-800"}>{q.markingCriteria.expectedAnswer || "missing"}</strong>
              </span>
            )}
            {q.questionData.figurePath && <Pill tone="blue">📷 Picture</Pill>}
            {q.needsReview && <Pill tone="amber">⚠ Needs review</Pill>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Move question up" disabled={isFirst} onClick={() => onMove(-1)}>↑</Button>
          <Button variant="ghost" size="sm" aria-label="Move question down" disabled={isLast} onClick={() => onMove(1)}>↓</Button>
          <Button variant="ghost" size="sm" onClick={onToggle}>{expanded ? "Close" : "Edit"}</Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-3 sm:p-4">
          {q.needsReview && (
            <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span><strong>Check this: </strong>{q.questionData.reviewReason ?? "Homework Buddy wasn't sure about this question."}</span>
              <Button size="sm" variant="secondary" onClick={() => onChange({ ...q, needsReview: false, questionData: { ...q.questionData, reviewReason: null } })}>
                ✓ I&apos;ve checked it
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[110px_1fr_160px_90px]">
            <Field label="Number">
              <input value={q.questionNumber} maxLength={20} onChange={(e) => set("questionNumber", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Topic">
              <input value={q.questionData.topic} maxLength={100} onChange={(e) => setData("topic", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Answer type">
              <select
                value={q.questionType}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  onChange({ ...q, questionType: type, marks: type === "not_digital" ? 0 : Math.max(q.marks, 1) });
                }}
                className={inputClass}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Marks">
              <input
                type="number"
                min={notDigital ? 0 : 1}
                max={20}
                disabled={notDigital}
                value={q.marks}
                onChange={(e) => set("marks", Math.min(20, Math.max(0, Number(e.target.value) || 0)))}
                className={inputClass}
              />
            </Field>
          </div>

          {q.questionData.figurePath && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-sky-50/60 p-3 ring-1 ring-sky-100">
              {figureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed URL
                <img src={figureUrl} alt={`Picture for question ${q.questionNumber}`} className="max-h-40 rounded-lg border border-slate-200 bg-white p-1" />
              ) : (
                <span className="text-sm text-slate-600">Picture attached (save to refresh the preview).</span>
              )}
              <div className="text-sm text-slate-600">
                <p>Shown to the child next to this question.</p>
                <button type="button" className="mt-1 font-semibold text-rose-700 hover:underline" onClick={() => setData("figurePath", null)}>
                  Remove picture (wrong crop)
                </button>
              </div>
            </div>
          )}

          <Field label="Question text">
            <textarea rows={2} maxLength={4000} value={q.questionText} onChange={(e) => set("questionText", e.target.value)} className={inputClass} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Shared question stem (for subparts)" hint="e.g. the price list or word box all parts use.">
              <textarea rows={2} maxLength={2000} value={q.questionData.parentText ?? ""} onChange={(e) => setData("parentText", e.target.value || null)} className={inputClass} />
            </Field>
            <Field label="Diagram / picture reference" hint="Where to look on the sheet. Don't give the answer away.">
              <textarea rows={2} maxLength={500} value={q.questionData.visualReference ?? ""} onChange={(e) => setData("visualReference", e.target.value || null)} className={inputClass} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Page on original">
              <input type="number" min={1} max={500} value={q.questionData.page ?? ""} onChange={(e) => setData("page", e.target.value ? Number(e.target.value) : null)} className={inputClass} />
            </Field>
            <Field label="Unit after answer box" hint="e.g. p, cm">
              <input maxLength={20} value={q.questionData.unit ?? ""} onChange={(e) => setData("unit", e.target.value || null)} className={inputClass} />
            </Field>
            {q.questionType === "multiple_choice" && (
              <Field label="How many to choose">
                <input type="number" min={1} max={5} value={q.questionData.selectCount} onChange={(e) => setData("selectCount", Math.min(5, Math.max(1, Number(e.target.value) || 1)))} className={inputClass} />
              </Field>
            )}
          </div>

          {q.questionType === "multiple_choice" && (
            <Field label="Options (one per line)">
              <textarea rows={4} value={lines(q.questionData.options)} onChange={(e) => setData("options", e.target.value.split("\n").slice(0, 20))} className={inputClass} />
            </Field>
          )}

          {!notDigital && (
            <div className="space-y-3 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Answer key (never shown to children before they hand in)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Expected answer">
                  <input value={q.markingCriteria.expectedAnswer} maxLength={1000} onChange={(e) => setCriteria("expectedAnswer", e.target.value)} className={`${inputClass} ${missingAnswer ? "border-rose-400" : ""}`} />
                </Field>
                <Field label="Other accepted answers (one per line)">
                  <textarea rows={2} value={lines(q.markingCriteria.acceptableAnswers)} onChange={(e) => setCriteria("acceptableAnswers", fromLines(e.target.value).slice(0, 20))} className={inputClass} />
                </Field>
              </div>
              <Field label="Marking criteria" hint="What to accept and when to give partial marks.">
                <textarea rows={2} maxLength={2000} value={q.markingCriteria.criteria} onChange={(e) => setCriteria("criteria", e.target.value)} className={inputClass} />
              </Field>
              <Field label="Working / explanation steps (one per line)">
                <textarea rows={3} value={lines(q.markingCriteria.workingSteps)} onChange={(e) => setCriteria("workingSteps", fromLines(e.target.value).slice(0, 10))} className={inputClass} />
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {sectionOptions.length > 1 && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Move to section
                  <select value={currentSectionKey} onChange={(e) => onMoveToSection(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                    {sectionOptions.map((s) => (
                      <option key={s.key} value={s.key}>{s.title || "Untitled"}</option>
                    ))}
                  </select>
                </label>
              )}
              {!q.needsReview && (
                <button type="button" className="text-sm font-semibold text-amber-800 hover:underline" onClick={() => onChange({ ...q, needsReview: true, questionData: { ...q.questionData, reviewReason: "Flagged by parent" } })}>
                  Flag for review
                </button>
              )}
            </div>
            <Button variant="ghost" size="sm" className="text-rose-700" onClick={onDelete}>
              Delete question
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
