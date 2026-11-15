"use client";

import { FormEvent, useState } from "react";
import { Button, ErrorBanner, Field, inputClass } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import type { HomeworkSetDetail } from "@/lib/library/types";

interface Target {
  id: string;
  title: string;
  schoolYear: number;
  status: string;
}

/** Asks for a topic, then moves an admin's own homework into the shared library. */
export function ShareDialog({ set, onDone, onCancel }: { set: Target; onDone: (set: HomeworkSetDetail) => void; onCancel: () => void }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${set.id}/visibility`, {
        method: "POST",
        json: { visibility: "shared", topic },
      });
      onDone(data.set);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl"
      >
        <h2 id="share-title" className="text-lg font-bold text-slate-900">🌍 Share with every family?</h2>
        <p className="text-slate-600">
          <strong>{set.title}</strong> moves to the shared library for <strong>Year {set.schoolYear}</strong>. Its questions,
          pictures and your children&apos;s scores stay the same.
          {set.status === "published"
            ? " Every family's children will be able to practise it straight away."
            : " Families will see it once you publish it."}
        </p>
        <Field label="Topic" hint="Children browse the shared library by year, then topic. e.g. Fractions, Times tables, Synonyms">
          <input required autoFocus maxLength={100} value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} />
        </Field>
        {error && <ErrorBanner message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !topic.trim()}>{busy ? "Sharing…" : "Share with everyone"}</Button>
        </div>
      </form>
    </div>
  );
}

/** Moves a shared set back to the admin's private homework. */
export async function makePrivate(setId: string): Promise<HomeworkSetDetail> {
  const data = await fetchJson<{ set: HomeworkSetDetail }>(`/api/library/sets/${setId}/visibility`, {
    method: "POST",
    json: { visibility: "private" },
  });
  return data.set;
}
