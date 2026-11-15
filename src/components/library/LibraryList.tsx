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

export default function LibraryList({ initialScope = "mine" }: { initialScope?: "mine" | "shared" }) {
  const [scope, setScope] = useState<"mine" | "shared">(initialScope);
  const [isAdmin, setIsAdmin] = useState(false);
  const [topic, setTopic] = useState("");
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
    const params = new URLSearchParams({ scope });
    if (year) params.set("year", year);
    if (week && scope === "mine") params.set("week", week);
    if (topic && scope === "shared") params.set("topic", topic);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return fetchJson<{ sets: HomeworkSetSummary[]; isAdmin: boolean }>(`/api/library/sets?${params}`).then((d) => {
      setIsAdmin(d.isAdmin);
      return d.sets;
    });
  }, [scope, year, week, topic, debouncedSearch]);

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

  const shared = scope === "shared";
  const topics = [...new Set((sets ?? []).map((x) => x.topic).filter((t): t is string => Boolean(t)))].sort();

  return (
    <>
      <PageHeader
        eyebrow={shared ? "Admin area" : "Parent area"}
        title={shared ? "Shared library" : "Homework Library"}
        description={
          shared
            ? "Practice sets by year and topic. Once published, every family's children can use them."
            : "Upload each week's homework once. Your children can then practise it digitally."
        }
        actions={
          (!shared || isAdmin) && (
            <Link
              href={shared ? "/library/new?shared=1" : "/library/new"}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              {shared ? "+ Add practice set" : "+ Upload homework"}
            </Link>
          )
        }
      />

      {(isAdmin || shared) && (
        <div role="tablist" aria-label="Library" className="mb-5 flex gap-2">
          {(["mine", "shared"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => {
                setScope(value);
                setSets(null);
                window.history.replaceState(null, "", value === "shared" ? "/library?scope=shared" : "/library");
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                scope === value ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {value === "mine" ? "My homework" : "🌍 Shared library"}
            </button>
          ))}
        </div>
      )}

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
        {shared ? (
          <label>
            <span className="sr-only">Topic</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass}>
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span className="sr-only">Week</span>
            <select value={week} onChange={(e) => setWeek(e.target.value)} className={inputClass}>
              <option value="">All weeks</option>
              {WEEKS.map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {sets === null && !error && <Spinner label="Loading homework…" />}

      {sets?.length === 0 && (
        <EmptyState icon="📚" title={year || week || topic || debouncedSearch ? "Nothing matches these filters" : shared ? "The shared library is empty" : "Your library is empty"}>
          {year || week || topic || debouncedSearch
            ? "Try a different year, week, topic or search."
            : shared
              ? isAdmin
                ? "Add a practice set for a year and topic to get started."
                : "Admins haven't added any shared practice sets yet."
              : "Upload this week's homework sheet to get started."}
        </EmptyState>
      )}

      {sets && sets.length > 0 && (
        <ul className="space-y-3">
          {sets.map((set) => (
            <li key={set.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {set.visibility === "shared" ? (
                  <div className="grid h-14 min-w-14 max-w-28 shrink-0 place-items-center rounded-2xl bg-emerald-50 px-2 text-center leading-tight">
                    <span className="text-[10px] font-semibold uppercase text-emerald-700">Topic</span>
                    <span className="line-clamp-2 text-xs font-bold text-emerald-900">{set.topic}</span>
                  </div>
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-center leading-tight">
                    <span className="text-[10px] font-semibold uppercase text-indigo-600">Week</span>
                    <span className="text-lg font-bold text-indigo-800">{set.weekNumber}</span>
                  </div>
                )}
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
                  {set.canEdit && (
                    <Link
                      href={`/library/${set.id}`}
                      className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      {set.status === "draft" ? "Review & edit" : "View & edit"}
                    </Link>
                  )}
                  {set.hasFile && (
                    <Button variant="ghost" size="sm" onClick={() => openOriginalFile(set.id).catch((e) => setError(errorMessage(e)))}>
                      Original
                    </Button>
                  )}
                  {set.canEdit &&
                    (set.status === "published" ? (
                      <Button variant="secondary" size="sm" disabled={busyId === set.id} onClick={() => setStatus(set, "draft")}>
                        Unpublish
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busyId === set.id || set.questionCount === 0} onClick={() => setStatus(set, "published")}>
                        Publish
                      </Button>
                    ))}
                  {set.canEdit && (
                    <Button variant="ghost" size="sm" className="text-rose-700" onClick={() => setToDelete(set)}>
                      Delete
                    </Button>
                  )}
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
          <strong>{toDelete?.title}</strong> (Year {toDelete?.schoolYear}, {toDelete?.visibility === "shared" ? `topic ${toDelete?.topic}` : `Week ${toDelete?.weekNumber}`}) will be deleted,
          together with its questions, the original file and{" "}
          <strong>{toDelete?.visibility === "shared" ? "every family's attempts and scores" : "all of your children's attempts and scores"}</strong> for it.
          This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
