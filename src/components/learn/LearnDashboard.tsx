"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, ErrorBanner, Field, inputClass, PageHeader, Pill, Spinner } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import type { AttemptSummary, StudentProfile } from "@/lib/learn/types";
import { SCHOOL_YEARS, SetSubject, WEEKS } from "@/lib/library/types";

const ACTIVE_STUDENT_KEY = "homework-buddy.active-student";

interface HomeworkItem {
  id: string;
  title: string;
  schoolYear: number;
  weekNumber: number;
  subject: SetSubject;
  homeworkDate: string | null;
  questionCount: number;
}

function readActiveStudent(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_STUDENT_KEY);
  } catch {
    return null;
  }
}
function writeActiveStudent(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_STUDENT_KEY, id);
  } catch {
    /* storage unavailable: just don't remember */
  }
}

function AddStudentForm({ onAdded, onCancel }: { onAdded: (s: StudentProfile) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ student: StudentProfile }>("/api/students", {
        method: "POST",
        json: { displayName: name, schoolYear: year },
      });
      onAdded(data.student);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <Field label="Child's first name">
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Maya" />
        </Field>
        <Field label="School year">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass}>
            {SCHOOL_YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
      </div>
      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add child"}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export default function LearnDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentProfile[] | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [week, setWeek] = useState("");
  const [homework, setHomework] = useState<HomeworkItem[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Load child profiles once.
  useEffect(() => {
    let cancelled = false;
    fetchJson<{ students: StudentProfile[] }>("/api/students").then(
      ({ students }) => {
        if (cancelled) return;
        setStudents(students);
        const remembered = readActiveStudent();
        const chosen = students.find((s) => s.id === remembered) ?? students[0];
        if (chosen) {
          setStudentId(chosen.id);
          setYear(chosen.schoolYear);
        }
      },
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Load homework whenever the child, year or week changes.
  useEffect(() => {
    if (!studentId || year === null) return;
    let cancelled = false;
    const params = new URLSearchParams({ studentId, year: String(year) });
    if (week) params.set("week", week);
    fetchJson<{ homework: HomeworkItem[]; attempts: AttemptSummary[] }>(`/api/learn/homework?${params}`).then(
      (data) => {
        if (cancelled) return;
        setHomework(data.homework);
        setAttempts(data.attempts);
        setError(null);
      },
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, [studentId, year, week, reload]);

  const student = students?.find((s) => s.id === studentId) ?? null;

  const byWeek = useMemo(() => {
    const groups = new Map<number, HomeworkItem[]>();
    for (const item of homework ?? []) {
      groups.set(item.weekNumber, [...(groups.get(item.weekNumber) ?? []), item]);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [homework]);

  function chooseStudent(s: StudentProfile) {
    setStudentId(s.id);
    setYear(s.schoolYear);
    setWeek("");
    setHomework(null);
    writeActiveStudent(s.id);
  }

  async function start(setId: string) {
    if (!studentId) return;
    setStarting(setId);
    setError(null);
    try {
      const data = await fetchJson<{ attemptId: string }>("/api/learn/attempts", {
        method: "POST",
        json: { studentId, homeworkSetId: setId },
      });
      router.push(`/learn/attempt/${data.attemptId}`);
    } catch (err) {
      setError(errorMessage(err));
      setStarting(null);
    }
  }

  if (students === null) return error ? <ErrorBanner message={error} /> : <Spinner />;

  if (students.length === 0 || adding) {
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">{students.length === 0 ? "Who will be practising?" : "Add a child"}</h1>
        <p className="mt-1 text-slate-600">Add a profile for each child so their scores are kept separately.</p>
        <div className="mt-5">
          <AddStudentForm
            onAdded={(s) => {
              setStudents([...students, s]);
              chooseStudent(s);
              setAdding(false);
            }}
            onCancel={students.length > 0 ? () => setAdding(false) : undefined}
          />
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Practise"
        title={student ? `Hi ${student.displayName}! 👋` : "Practise your homework"}
        description="Pick your homework and answer the questions. When you're done, hand it in to see how you did."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Who is practising?">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === studentId}
            onClick={() => chooseStudent(s)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              s.id === studentId ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {s.displayName} · Y{s.schoolYear}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>+ Add child</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-md">
        <Field label="Year">
          <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} className={`${inputClass} text-base`}>
            {SCHOOL_YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        <Field label="Week">
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={`${inputClass} text-base`}>
            <option value="">All weeks</option>
            {WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </Field>
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /></div>}

      {homework === null && !error && <Spinner label="Finding your homework…" />}

      {homework?.length === 0 && (
        <EmptyState icon="🗓️" title="No homework here yet">
          Ask a grown-up to add and publish this week&apos;s homework in the Library.
        </EmptyState>
      )}

      <div className="space-y-8">
        {byWeek.map(([weekNumber, items]) => (
          <section key={weekNumber}>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Week {weekNumber}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const mine = attempts.filter((a) => a.homeworkSetId === item.id);
                const open = mine.find((a) => a.status !== "completed");
                const done = mine.filter((a) => a.status === "completed");
                const best = done.reduce<AttemptSummary | null>((b, a) => (!b || (a.percentage ?? 0) > (b.percentage ?? 0) ? a : b), null);
                return (
                  <li key={item.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                      <Pill tone="indigo">{item.subject === "Both" ? "English & Maths" : item.subject}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.questionCount} questions</p>
                    {best && (
                      <p className="mt-2 text-sm font-semibold text-emerald-700">
                        ⭐ Best score: {best.score}/{best.totalMarks} ({best.percentage ?? 0}%)
                      </p>
                    )}
                    {open && <p className="mt-2 text-sm font-semibold text-amber-800">You&apos;re part way through this one.</p>}

                    <div className="mt-4 flex flex-wrap gap-2 pt-1">
                      <Button disabled={starting !== null} onClick={() => void start(item.id)}>
                        {starting === item.id ? "Opening…" : open ? "Carry on" : done.length ? "Practise again" : "Start"}
                      </Button>
                    </div>

                    {done.length > 0 && (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer font-semibold text-slate-600">Previous attempts ({done.length})</summary>
                        <ul className="mt-2 space-y-1">
                          {done.map((a) => (
                            <li key={a.id}>
                              <Link href={`/learn/attempt/${a.id}`} className="text-indigo-700 hover:underline">
                                {new Date(a.submittedAt ?? a.startedAt).toLocaleDateString("en-GB")} — {a.score}/{a.totalMarks} ({a.percentage ?? 0}%)
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
