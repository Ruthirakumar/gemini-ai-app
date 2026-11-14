"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, ErrorBanner, Field, inputClass, Pill, Spinner, SuccessBanner } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import {
  EditorSection,
  HomeworkSetDetail,
  markingCriteriaSchema,
  questionDataSchema,
  SCHOOL_YEARS,
  SECTION_SUBJECTS,
  SectionSubject,
  SetSubject,
  WEEKS,
} from "@/lib/library/types";
import { StatusPill } from "./LibraryList";
import QuestionEditor, { KeyedQuestion } from "./QuestionEditor";

type KeyedSection = Omit<EditorSection, "questions"> & { key: string; questions: KeyedQuestion[] };

let keySeed = 0;
const newKey = () => `k${++keySeed}`;

const withKeys = (sections: EditorSection[]): KeyedSection[] =>
  sections.map((s) => ({ ...s, key: newKey(), questions: s.questions.map((q) => ({ ...q, key: newKey() })) }));

const stripKeys = (sections: KeyedSection[]): EditorSection[] =>
  sections.map(({ key: _s, questions, ...s }) => {
    void _s;
    return {
      ...s,
      questions: questions.map(({ key: _q, ...q }) => {
        void _q;
        return q;
      }),
    };
  });

function blankQuestion(number: string, subject: SectionSubject): KeyedQuestion {
  return {
    key: newKey(),
    id: null,
    questionNumber: number,
    questionText: "",
    questionType: subject === "Maths" ? "number" : "short_text",
    marks: 1,
    needsReview: false,
    questionData: questionDataSchema.parse({}),
    markingCriteria: markingCriteriaSchema.parse({}),
  };
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

interface Meta {
  title: string;
  schoolYear: number;
  weekNumber: number;
  subject: SetSubject;
  homeworkDate: string | null;
}

export default function HomeworkEditor({ setId }: { setId: string }) {
  const [detail, setDetail] = useState<HomeworkSetDetail | null>(null);
  const [sections, setSections] = useState<KeyedSection[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "unpublish" | "extract">(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<{ url: string; type: string | null } | null>(null);
  const [showFile, setShowFile] = useState(false);
  const [confirmExtract, setConfirmExtract] = useState(false);

  const applyDetail = useCallback((d: HomeworkSetDetail) => {
    setDetail(d);
    setSections(withKeys(d.sections));
    setMeta({ title: d.title, schoolYear: d.schoolYear, weekNumber: d.weekNumber, subject: d.subject, homeworkDate: d.homeworkDate });
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}`);
      applyDetail(data.set);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [setId, applyDetail]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}`).then(
      (data) => {
        if (cancelled) return;
        applyDetail(data.set);
        // Messages passed from the upload page.
        const params = new URLSearchParams(window.location.search);
        const passedError = params.get("error");
        if (passedError) setError(passedError);
        if (params.get("extracted")) setSuccess("Questions extracted! Please check them, especially anything flagged for review.");
        if (passedError || params.get("extracted")) window.history.replaceState(null, "", window.location.pathname);
      },
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, [setId, applyDetail]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const stats = useMemo(() => {
    const questions = sections.flatMap((s) => s.questions);
    return {
      questions: questions.filter((q) => q.questionType !== "not_digital").length,
      marks: questions.reduce((n, q) => n + q.marks, 0),
      review: questions.filter((q) => q.needsReview).length,
      missing: questions.filter((q) => q.questionType !== "not_digital" && !q.markingCriteria.expectedAnswer.trim()).length,
    };
  }, [sections]);

  function update(next: KeyedSection[]) {
    setSections(next);
    setDirty(true);
    setSuccess(null);
  }
  const updateSection = (key: string, patch: Partial<KeyedSection>) =>
    update(sections.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  async function save(): Promise<boolean> {
    if (!meta) return false;
    setBusy("save");
    setError(null);
    try {
      if (detail && (meta.title !== detail.title || meta.schoolYear !== detail.schoolYear || meta.weekNumber !== detail.weekNumber || meta.subject !== detail.subject || meta.homeworkDate !== detail.homeworkDate)) {
        await fetchJson(`/api/library/sets/${setId}`, { method: "PATCH", json: meta });
      }
      const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}/content`, {
        method: "PUT",
        json: { sections: stripKeys(sections) },
      });
      applyDetail(data.set);
      setSuccess("Saved.");
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: "published" | "draft") {
    if (dirty && !(await save())) return;
    setBusy(status === "published" ? "publish" : "unpublish");
    setError(null);
    try {
      const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}`, { method: "PATCH", json: { status } });
      applyDetail(data.set);
      setSuccess(status === "published" ? "Published! Your children can now practise this homework." : "Unpublished. It's a draft again.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function reExtract() {
    setConfirmExtract(false);
    setBusy("extract");
    setError(null);
    try {
      const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}/extract`, { method: "POST", json: {} });
      applyDetail(data.set);
      setSuccess("Questions extracted again.");
    } catch (err) {
      setError(errorMessage(err));
      void load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleFile() {
    if (showFile) return setShowFile(false);
    try {
      if (!fileUrl) {
        const data = await fetchJson<{ url: string; fileType: string | null }>(`/api/library/sets/${setId}/file`);
        setFileUrl({ url: data.url, type: data.fileType });
      }
      setShowFile(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!detail || !meta) {
    return error ? <ErrorBanner message={error} onRetry={load} /> : <Spinner label="Loading homework…" />;
  }

  const published = detail.status === "published";
  const sectionOptions = sections.map((s) => ({ key: s.key, title: s.sectionTitle }));

  return (
    <div className={showFile ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]" : ""}>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/library" className="text-sm font-semibold text-indigo-700 hover:underline">← Homework Library</Link>
          <div className="flex items-center gap-2">
            <StatusPill status={detail.status} />
            {dirty && <Pill tone="amber">Unsaved changes</Pill>}
          </div>
        </div>

        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <input value={meta.title} maxLength={200} onChange={(e) => { setMeta({ ...meta, title: e.target.value }); setDirty(true); }} className={`${inputClass} text-lg font-semibold`} />
            </Field>
            <Field label="School year">
              <select value={meta.schoolYear} onChange={(e) => { setMeta({ ...meta, schoolYear: Number(e.target.value) }); setDirty(true); }} className={inputClass}>
                {SCHOOL_YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </Field>
            <Field label="Week">
              <select value={meta.weekNumber} onChange={(e) => { setMeta({ ...meta, weekNumber: Number(e.target.value) }); setDirty(true); }} className={inputClass}>
                {WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </Field>
            <Field label="Subject">
              <select value={meta.subject} onChange={(e) => { setMeta({ ...meta, subject: e.target.value as SetSubject }); setDirty(true); }} className={inputClass}>
                <option value="Both">English and Maths</option>
                <option value="English">English</option>
                <option value="Maths">Maths</option>
              </select>
            </Field>
            <Field label="Homework date">
              <input type="date" value={meta.homeworkDate ?? ""} onChange={(e) => { setMeta({ ...meta, homeworkDate: e.target.value || null }); setDirty(true); }} className={inputClass} />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Pill tone="slate">{sections.length} section{sections.length === 1 ? "" : "s"}</Pill>
            <Pill tone="slate">{stats.questions} questions</Pill>
            <Pill tone="slate">{stats.marks} marks</Pill>
            {stats.review > 0 && <Pill tone="amber">{stats.review} to review</Pill>}
            {stats.missing > 0 && <Pill tone="red">{stats.missing} missing an answer</Pill>}
            {detail.attemptCount > 0 && <Pill tone="indigo">{detail.attemptCount} attempt{detail.attemptCount === 1 ? "" : "s"}</Pill>}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={busy !== null || !dirty} variant="secondary">
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
            {published ? (
              <Button variant="secondary" disabled={busy !== null} onClick={() => void changeStatus("draft")}>
                {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </Button>
            ) : (
              <Button disabled={busy !== null || stats.questions === 0 || stats.review > 0 || stats.missing > 0} onClick={() => void changeStatus("published")}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </Button>
            )}
            {detail.hasFile && (
              <Button variant="ghost" onClick={() => void toggleFile()}>
                {showFile ? "Hide original" : "Show original"}
              </Button>
            )}
            {detail.hasFile && !published && detail.attemptCount === 0 && (
              <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmExtract(true)}>
                {busy === "extract" ? "Extracting… (1-3 min)" : "Extract again"}
              </Button>
            )}
          </div>
          {!published && (stats.review > 0 || stats.missing > 0) && (
            <p className="mt-3 text-sm text-amber-800">
              Before publishing, check the flagged questions and make sure every question has an expected answer.
            </p>
          )}
          {published && <p className="mt-3 text-sm text-slate-600">Children can practise this now. To flag questions or extract again, unpublish it first.</p>}
        </Card>

        <div aria-live="polite" className="space-y-2">
          {error && <ErrorBanner message={error} />}
          {success && <SuccessBanner message={success} />}
          {detail.extractionStatus === "failed" && detail.extractionError && !error && (
            <ErrorBanner message={`Extraction failed: ${detail.extractionError}`} />
          )}
        </div>

        {busy === "extract" && <Spinner label="Extracting questions… this can take a few minutes." />}

        {sections.map((section, sIndex) => (
          <Card key={section.key} className="!p-4 sm:!p-5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-2">
                <Field label={`Section ${sIndex + 1} title`} className="min-w-0 flex-1">
                  <input value={section.sectionTitle} maxLength={200} onChange={(e) => updateSection(section.key, { sectionTitle: e.target.value })} className={`${inputClass} font-semibold`} />
                </Field>
                <Field label="Subject" className="w-32">
                  <select value={section.subject} onChange={(e) => updateSection(section.key, { subject: e.target.value as SectionSubject })} className={inputClass}>
                    {SECTION_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="flex gap-1 self-end pb-1">
                  <Button variant="ghost" size="sm" aria-label="Move section up" disabled={sIndex === 0} onClick={() => update(move(sections, sIndex, -1))}>↑</Button>
                  <Button variant="ghost" size="sm" aria-label="Move section down" disabled={sIndex === sections.length - 1} onClick={() => update(move(sections, sIndex, 1))}>↓</Button>
                </div>
              </div>
              <Field label="Instructions (shown to the child)">
                <textarea rows={2} maxLength={2000} value={section.instructions ?? ""} onChange={(e) => updateSection(section.key, { instructions: e.target.value || null })} className={inputClass} />
              </Field>

              <ul className="space-y-2">
                {section.questions.map((q, qIndex) => (
                  <QuestionEditor
                    key={q.key}
                    question={q}
                    expanded={expanded === q.key}
                    onToggle={() => setExpanded(expanded === q.key ? null : q.key)}
                    onChange={(next) => updateSection(section.key, { questions: section.questions.map((x) => (x.key === q.key ? next : x)) })}
                    onMove={(dir) => updateSection(section.key, { questions: move(section.questions, qIndex, dir) })}
                    onDelete={() => updateSection(section.key, { questions: section.questions.filter((x) => x.key !== q.key) })}
                    sectionOptions={sectionOptions}
                    currentSectionKey={section.key}
                    onMoveToSection={(targetKey) =>
                      update(
                        sections.map((s) =>
                          s.key === section.key
                            ? { ...s, questions: s.questions.filter((x) => x.key !== q.key) }
                            : s.key === targetKey
                              ? { ...s, questions: [...s.questions, q] }
                              : s
                        )
                      )
                    }
                    isFirst={qIndex === 0}
                    isLast={qIndex === section.questions.length - 1}
                  />
                ))}
              </ul>

              <div className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const q = blankQuestion(String(section.questions.length + 1), section.subject);
                    updateSection(section.key, { questions: [...section.questions, q] });
                    setExpanded(q.key);
                  }}
                >
                  + Add question
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-700"
                  onClick={() => {
                    if (section.questions.length === 0 || window.confirm(`Remove "${section.sectionTitle}" and its ${section.questions.length} questions?`)) {
                      update(sections.filter((s) => s.key !== section.key));
                    }
                  }}
                >
                  Remove section
                </Button>
              </div>
            </div>
          </Card>
        ))}

        <Button
          variant="secondary"
          className="w-full border-2 border-dashed !ring-0"
          onClick={() =>
            update([
              ...sections,
              { key: newKey(), id: null, subject: meta.subject === "Maths" ? "Maths" : "English", sectionTitle: "New section", instructions: null, questions: [] },
            ])
          }
        >
          + Add section
        </Button>

        {dirty && (
          <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg">
            <span className="text-sm">You have unsaved changes.</span>
            <Button size="sm" onClick={() => void save()} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
          </div>
        )}
      </div>

      {showFile && fileUrl && (
        <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:h-full">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-700">{detail.originalFileName ?? "Original worksheet"}</span>
              <a href={fileUrl.url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 hover:underline">Open in new tab</a>
            </div>
            {fileUrl.type === "application/pdf" ? (
              <iframe src={fileUrl.url} title="Original worksheet" className="flex-1" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- private signed URL
              <img src={fileUrl.url} alt="Original worksheet" className="flex-1 object-contain" />
            )}
          </div>
        </aside>
      )}

      <ConfirmDialog
        open={confirmExtract}
        title="Extract questions again?"
        confirmLabel="Replace questions"
        danger
        onConfirm={() => void reExtract()}
        onCancel={() => setConfirmExtract(false)}
      >
        This replaces <strong>all</strong> current sections and questions, including any edits you made, with a fresh extraction from the original file.
      </ConfirmDialog>
    </div>
  );
}
