"use client";

import { ReadAloudButton } from "@/components/speech/SpeechProvider";
import type { CheckView } from "@/lib/learn/types";

/** What Buddy says when reading a check result aloud. */
export function checkToSpeech(check: CheckView): string[] {
  switch (check.state) {
    case "correct":
      return [check.feedback || "Correct!", check.explanation && check.explanation !== check.feedback ? check.explanation : ""].filter(Boolean);
    case "try_again":
      return [check.feedback, check.hint ? `Here's a hint. ${check.hint}` : ""].filter(Boolean);
    case "needs_review":
      return [check.feedback || "A grown-up will check this one with you."];
    default:
      return [
        check.feedback,
        check.correctAnswer ? `The answer is ${check.correctAnswer}.` : "",
        check.explanation ?? "",
        ...check.workingSteps,
      ].filter(Boolean);
  }
}

const ReadIt = ({ check }: { check: CheckView }) => (
  <ReadAloudButton text={checkToSpeech(check)} id={`check-${check.questionId}`} className="-ml-2 mt-1" />
);

/** Shows the result of checking one answer while practising. */
export default function CheckFeedback({ check }: { check: CheckView }) {
  if (check.state === "correct") {
    return (
      <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">
        <p className="font-semibold">✓ {check.feedback || "Correct!"}</p>
        {check.triesUsed > 1 && <p className="mt-1 text-sm">You fixed it on try {check.triesUsed} - great perseverance! 💪</p>}
        {check.explanation && check.explanation !== check.feedback && <p className="mt-1 text-sm">{check.explanation}</p>}
        <ReadIt check={check} />
      </div>
    );
  }

  if (check.state === "try_again") {
    return (
      <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-200">
        <p className="font-semibold">{check.feedback}</p>
        {check.hint && (
          <p className="mt-1 flex gap-2 text-sm">
            <span aria-hidden>💡</span>
            <span><strong>Hint:</strong> {check.hint}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-amber-800">
          Change your answer and check again · {check.triesLeft} {check.triesLeft === 1 ? "try" : "tries"} left
        </p>
        <ReadIt check={check} />
      </div>
    );
  }

  if (check.state === "needs_review") {
    return (
      <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
        🔎 {check.feedback || "A grown-up will check this one with you."}
      </p>
    );
  }

  // revealed
  return (
    <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sky-950 ring-1 ring-sky-200">
      <p className="font-semibold">{check.feedback}</p>
      {check.correctAnswer && (
        <p className="mt-1">
          The answer is <strong>{check.correctAnswer}</strong>.
        </p>
      )}
      {check.explanation && <p className="mt-1 text-sm">{check.explanation}</p>}
      {check.workingSteps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {check.workingSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      <ReadIt check={check} />
    </div>
  );
}
