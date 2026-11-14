"use client";

import { useEffect, useState } from "react";
import { ErrorBanner, Spinner } from "@/components/ui";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import type { AttemptView } from "@/lib/learn/types";
import AttemptResults from "./AttemptResults";
import PracticeRunner from "./PracticeRunner";

export default function AttemptScreen({ attemptId }: { attemptId: string }) {
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ attempt: AttemptView }>(`/api/learn/attempts/${attemptId}`).then(
      (data) => !cancelled && setAttempt(data.attempt),
      (err) => !cancelled && setError(errorMessage(err))
    );
    return () => {
      cancelled = true;
    };
  }, [attemptId, reload]);

  if (!attempt) {
    return error ? <ErrorBanner message={error} onRetry={() => { setError(null); setReload((n) => n + 1); }} /> : <Spinner label="Opening your homework…" />;
  }

  if (attempt.status === "completed") return <AttemptResults attempt={attempt} />;

  return (
    <PracticeRunner
      attempt={attempt}
      onMarked={(marked) => {
        setAttempt(marked);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
  );
}
