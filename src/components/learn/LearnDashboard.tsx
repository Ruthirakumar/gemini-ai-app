"use client";

import Link from "next/link";
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
  weekNumber: number | null;
  topic: string | null;
  subject: SetSubject;
  homeworkDate: string | null;
  questionCount: number;
  sectionCount: number;
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
  const [students, setStudents] = useState<StudentProfile[] | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [week, setWeek] = useState("");
  const [homework, setHomework] = useState<HomeworkItem[] | null>(null);
  const [shared, setShared] = useState<HomeworkItem[]>([]);
  const [tab, setTab] = useState<"homework" | "library">("homework");
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    fetchJson<{ homework: HomeworkItem[]; shared: HomeworkItem[]; attempts: AttemptSummary[] }>(`/api/learn/homework?${params}`).then(
      (data) => {
        if (cancelled) return;
        setHomework(data.homework);
        setShared(data.shared);
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
      const key = item.weekNumber ?? 0;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [homework]);

  const byTopic = useMemo(() => {
    const groups = new Map<string, HomeworkItem[]>();
    for (const item of shared) {
      const key = item.topic ?? "Other";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shared]);

  function chooseStudent(s: StudentProfile) {
    setStudentId(s.id);
    setYear(s.schoolYear);
    setWeek("");
    setHomework(null);
    writeActiveStudent(s.id);
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

      <div role="tablist" aria-label="What to practise" className="mb-5 flex flex-wrap gap-2">
        {([
          ["homework", "📝 My homework"],
          ["library", `🌍 Practice library${shared.length ? ` (${shared.length})` : ""}`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === value ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-md">
        <Field label="Year">
          <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))} className={`${inputClass} text-base`}>
            {SCHOOL_YEARS.map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </Field>
        {tab === "homework" && (
          <Field label="Week">
            <select value={week} onChange={(e) => setWeek(e.target.value)} className={`${inputClass} text-base`}>
              <option value="">All weeks</option>
              {WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </Field>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => setReload((n) => n + 1)} /></div>}

      {homework === null && !error && <Spinner label="Finding your homework…" />}

      {tab === "homework" && homework?.length === 0 && (
        <EmptyState icon="🗓️" title="No homework here yet">
          Ask a grown-up to add and publish this week&apos;s homework in the Library.
        </EmptyState>
      )}
      {tab === "library" && homework !== null && shared.length === 0 && (
        <EmptyState icon="🌍" title={`No practice sets for Year ${year} yet`}>
          The shared practice library is added to by admins. Try another year.
        </EmptyState>
      )}

      <div className="space-y-8">
        {(tab === "homework" ? byWeek.map(([w, items]) => [`Week ${w}`, items] as const) : byTopic).map(([heading, items]) => (
          <section key={heading}>
            <h2 className="mb-3 text-lg font-bold text-slate-900">{heading}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <HomeworkCard
                  key={item.id}
                  item={item}
                  attempts={attempts.filter((a) => a.homeworkSetId === item.id)}
                  studentId={studentId}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function HomeworkCard({
  item,
  attempts,
  studentId,
}: {
  item: HomeworkItem;
  attempts: AttemptSummary[];
  studentId: string | null;
}) {
  // Progress is counted per section: a finished section attempt, or a finished
  // whole-homework attempt, marks sections as done.
  const finishedWhole = attempts.some((a) => a.sectionId === null && a.status === "completed");
  const doneSections = finishedWhole
    ? item.sectionCount
    : new Set(attempts.filter((a) => a.sectionId && a.status === "completed").map((a) => a.sectionId)).size;
  const inProgress = attempts.some((a) => a.status !== "completed");
  const pct = item.sectionCount ? Math.round((doneSections / item.sectionCount) * 100) : 0;
  const href = studentId ? `/learn/homework/${item.id}?student=${studentId}` : "/learn";

  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
          <Pill tone="indigo">{item.subject === "Both" ? "English & Maths" : item.subject}</Pill>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {item.sectionCount} section{item.sectionCount === 1 ? "" : "s"} · {item.questionCount} questions
        </p>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm font-medium text-slate-700">
            <span>
              {doneSections === 0 ? "Not started yet" : doneSections === item.sectionCount ? "All sections done! 🎉" : `${doneSections} of ${item.sectionCount} sections done`}
            </span>
            {inProgress && <span className="text-amber-800">In progress</span>}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <span className="mt-4 inline-flex w-fit items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
          {doneSections === 0 && !inProgress ? "Let's start →" : doneSections === item.sectionCount ? "See my scores →" : "Keep going →"}
        </span>
      </Link>
    </li>
  );
}
