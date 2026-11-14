"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, EmptyState, ErrorBanner, inputClass, PageHeader, Pill, Spinner } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import { HomeworkSetSummary, SCHOOL_YEARS, WEEKS } from "@/lib/library/types";
import { openOriginalFile } from "./openOriginalFile";

export function StatusPill({ status }: { status: HomeworkSetSummary["status"] }) {
  if (status === "published") return <Pill tone="green">● Published</Pill>;
  if (status === "archived") return <Pill tone="slate">Archived</Pill>;
  return <Pill tone="amber">✎ Draft</Pill>;
}

export default function LibraryList() {
  const [year, setYear] = useState("");
  const [week, setWeek] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sets, setSets] = useState<HomeworkSetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<HomeworkSetSummary | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchSets = useCallback(() => {
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (week) params.set("week", week);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return fetchJson<{ sets: HomeworkSetSummary[] }>(`/api/library/sets?${params}`).then((d) => d.sets);
  }, [year, week, debouncedSearch]);

  const load = useCallback(async () => {
    try {
      setSets(await fetchSets());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [fetchSets]);

  useEffect(() => {
    let cancelled = false;
    fetchSets().then(
      (data) => {
        if (cancelled) return;
        setSets(data);
        setError(null);
      },
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, [fetchSets]);

  async function setStatus(set: HomeworkSetSummary, status: "published" | "draft") {
    setBusyId(set.id);
    setError(null);
    try {
      await fetchJson(`/api/library/sets/${set.id}`, { method: "PATCH", json: { status } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await fetchJson(`/api/library/sets/${toDelete.id}`, { method: "DELETE" });
      setToDelete(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
      setToDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Parent area"
        title="Homework Library"
        description="Upload each week's homework once. Your children can then practise it digitally."
        actions={
          <Link
            href="/library/new"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            + Upload homework
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label>
          <span className="sr-only">Search by title</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className={inputClass}
          />
        </label>
        <label>
          <span className="sr-only">School year</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} className={inputClass}>
            <option value="">All years</option>
            {SCHOOL_YEARS.map((y) => (
              <option key={y} value={y}>Year {y}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Week</span>
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={inputClass}>
            <option value="">All weeks</option>
            {WEEKS.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {sets === null && !error && <Spinner label="Loading homework…" />}

      {sets?.length === 0 && (
        <EmptyState icon="📚" title={year || week || debouncedSearch ? "No homework matches these filters" : "Your library is empty"}>
          {year || week || debouncedSearch ? "Try a different year, week or search." : "Upload this week's homework sheet to get started."}
        </EmptyState>
      )}

      {sets && sets.length > 0 && (
        <ul className="space-y-3">
          {sets.map((set) => (
            <li key={set.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-center leading-tight">
                  <span className="text-[10px] font-semibold uppercase text-indigo-600">Week</span>
                  <span className="text-lg font-bold text-indigo-800">{set.weekNumber}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/library/${set.id}`} className="truncate text-lg font-semibold text-slate-900 hover:text-indigo-700">
                      {set.title}
                    </Link>
                    <StatusPill status={set.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span>Year {set.schoolYear}</span>
                    <span>{set.subject === "Both" ? "English & Maths" : set.subject}</span>
                    <span>{set.questionCount} question{set.questionCount === 1 ? "" : "s"}</span>
                    {set.homeworkDate && <span>{new Date(set.homeworkDate).toLocaleDateString("en-GB")}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {set.needsReviewCount > 0 && <Pill tone="amber">{set.needsReviewCount} to review</Pill>}
                    {set.extractionStatus === "processing" && <Pill tone="indigo">Extracting…</Pill>}
                    {set.extractionStatus === "failed" && <Pill tone="red">Extraction failed</Pill>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/library/${set.id}`}
                    className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
                  >
                    {set.status === "draft" ? "Review & edit" : "View & edit"}
                  </Link>
                  {set.hasFile && (
                    <Button variant="ghost" size="sm" onClick={() => openOriginalFile(set.id).catch((e) => setError(errorMessage(e)))}>
                      Original
                    </Button>
                  )}
                  {set.status === "published" ? (
                    <Button variant="secondary" size="sm" disabled={busyId === set.id} onClick={() => setStatus(set, "draft")}>
                      Unpublish
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busyId === set.id || set.questionCount === 0} onClick={() => setStatus(set, "published")}>
                      Publish
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setToDelete(set)}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this homework?"
        confirmLabel="Delete homework"
        danger
        busy={busyId === toDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        <p>
          <strong>{toDelete?.title}</strong> (Year {toDelete?.schoolYear}, Week {toDelete?.weekNumber}) will be deleted,
          together with its questions, the original file and <strong>all of your children&apos;s attempts and scores</strong> for it.
          This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
