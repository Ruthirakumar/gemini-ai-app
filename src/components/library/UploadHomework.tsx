"use client";

import { useRouter } from "next/navigation";
import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Button, Card, ErrorBanner, Field, inputClass, PageHeader } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import { ACCEPT_ATTRIBUTE, describeImageProblem, formatBytes, MAX_LIBRARY_FILE_BYTES } from "@/lib/homework/constants";
import { HomeworkSetSummary, SCHOOL_YEARS, SetSubject, WEEKS } from "@/lib/library/types";
import { WORKSHEET_BUCKET } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Stage = "form" | "uploading" | "extracting";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function ExtractionProgress({ stage }: { stage: Stage }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    { label: "Uploading the file securely", done: stage === "extracting" },
    { label: "Reading every page", done: stage === "extracting" && elapsed > 15 },
    { label: "Finding sections and questions", done: stage === "extracting" && elapsed > 40 },
    { label: "Working out answers and marking guidance", done: false },
  ];

  return (
    <Card className="mx-auto max-w-xl" >
      <div aria-live="polite" aria-busy="true">
        <h2 className="text-lg font-semibold text-slate-900">Extracting questions…</h2>
        <p className="mt-1 text-sm text-slate-500">
          A long worksheet can take 1-3 minutes. Please keep this page open. ({elapsed}s)
        </p>
        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => {
            const active = !step.done && (i === 0 || steps[i - 1].done);
            return (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                    step.done ? "bg-emerald-100 text-emerald-700" : active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span className={step.done ? "text-slate-500" : active ? "font-semibold text-slate-900" : "text-slate-400"}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

export default function UploadHomework({ shared = false }: { shared?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [schoolYear, setSchoolYear] = useState(4);
  const [weekNumber, setWeekNumber] = useState(1);
  const [subject, setSubject] = useState<SetSubject>("Both");
  const [homeworkDate, setHomeworkDate] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState<string | null>(null);

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return;
    const problem = describeImageProblem(candidate, MAX_LIBRARY_FILE_BYTES);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setFile(candidate);
    if (!title) setTitle(candidate.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Please choose the homework file (PDF or photo).");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setError(null);
    setStage("uploading");
    let setId: string | null = null;
    try {
      const created = await fetchJson<{ set: HomeworkSetSummary; uploadFolder: string }>("/api/library/sets", {
        method: "POST",
        json: shared
          ? { title, schoolYear, subject, visibility: "shared", topic, homeworkDate: null }
          : { title, schoolYear, weekNumber, subject, homeworkDate: homeworkDate || null, visibility: "private" },
      });
      setId = created.set.id;

      const path = `${created.uploadFolder}/original.${EXTENSIONS[file.type] ?? "bin"}`;
      const { error: uploadError } = await supabase.storage
        .from(WORKSHEET_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error("The file couldn't be uploaded. Please try again.");

      setStage("extracting");
      await fetchJson(`/api/library/sets/${setId}/extract`, {
        method: "POST",
        json: { filePath: path, fileName: file.name },
      });
      router.push(`/library/${setId}?extracted=1`);
    } catch (err) {
      if (setId) {
        // The draft exists; let the parent retry or fix things from the review screen.
        router.push(`/library/${setId}?error=${encodeURIComponent(errorMessage(err))}`);
        return;
      }
      setError(errorMessage(err));
      setStage("form");
    }
  }

  if (stage !== "form") return <ExtractionProgress stage={stage} />;

  return (
    <>
      <PageHeader
        eyebrow={shared ? "Shared library" : "Homework Library"}
        title={shared ? "Add a shared practice set" : "Upload weekly homework"}
        description={
          shared
            ? "Upload a worksheet for a year and topic. After you publish it, every family's children can practise it."
            : "Homework Buddy will read the sheet and turn it into questions you can check before publishing."
        }
      />
      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              chooseFile(e.dataTransfer.files[0]);
            }}
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center ${
              dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50/60"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <span aria-hidden className="text-3xl">{file.type === "application/pdf" ? "📄" : "🖼️"}</span>
                <p className="font-semibold text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
                <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                  Choose a different file
                </Button>
              </div>
            ) : (
              <>
                <p className="font-medium text-slate-800">Drag and drop the homework PDF or photo here</p>
                <p className="mt-1 text-sm text-slate-500">PDF, JPG, PNG or WebP · up to {formatBytes(MAX_LIBRARY_FILE_BYTES)}</p>
                <Button variant="secondary" className="mt-4" onClick={() => inputRef.current?.click()}>
                  Browse files
                </Button>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Homework title" className="sm:col-span-2">
              <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Year 4 Week 8 Homework" className={inputClass} />
            </Field>
            <Field label="School year">
              <select value={schoolYear} onChange={(e) => setSchoolYear(Number(e.target.value))} className={inputClass}>
                {SCHOOL_YEARS.map((y) => (
                  <option key={y} value={y}>Year {y}</option>
                ))}
              </select>
            </Field>
            {shared ? (
              <Field label="Topic" hint="e.g. Fractions, Times tables, Synonyms, Comprehension">
                <input required maxLength={100} value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
              </Field>
            ) : (
              <Field label="Week">
                <select value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} className={inputClass}>
                  {WEEKS.map((w) => (
                    <option key={w} value={w}>Week {w}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Subject">
              <select value={subject} onChange={(e) => setSubject(e.target.value as SetSubject)} className={inputClass}>
                <option value="Both">English and Maths</option>
                <option value="English">English</option>
                <option value="Maths">Maths</option>
              </select>
            </Field>
            {!shared && (
              <Field label="Homework date (optional)">
                <input type="date" value={homeworkDate} onChange={(e) => setHomeworkDate(e.target.value)} className={inputClass} />
              </Field>
            )}
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              It will be saved as a <strong>draft</strong>. {shared ? "No family can see it" : "Children can't see it"} until you publish.
            </p>
            <Button type="submit" size="lg" disabled={!file}>
              Upload and extract questions
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
