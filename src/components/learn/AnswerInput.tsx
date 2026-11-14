"use client";

import type { PracticeQuestionView } from "@/lib/learn/types";

interface Props {
  question: PracticeQuestionView;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const splitChoices = (value: string) => value.split(/\s*,\s*/).filter(Boolean);

export default function AnswerInput({ question, value, onChange, disabled }: Props) {
  const id = `answer-${question.id}`;
  const base =
    "w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:bg-slate-100";

  if (question.questionType === "not_digital") {
    return (
      <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sky-900 ring-1 ring-sky-200">
        ✏️ Do this one on your paper worksheet. It isn&apos;t marked here.
      </p>
    );
  }

  if (question.questionType === "multiple_choice" && question.data.options.length > 0) {
    const chosen = splitChoices(value);
    const max = question.data.selectCount;
    const toggle = (option: string) => {
      if (chosen.includes(option)) onChange(chosen.filter((c) => c !== option).join(", "));
      else if (max === 1) onChange(option);
      else if (chosen.length < max) onChange([...chosen, option].join(", "));
    };
    return (
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-semibold text-slate-600">
          {max === 1 ? "Choose one:" : `Choose ${max}:`} {max > 1 && <span className="font-normal">({chosen.length}/{max} chosen)</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {question.data.options.map((option) => {
            const selected = chosen.includes(option);
            return (
              <button
                key={option}
                type="button"
                role={max === 1 ? "radio" : "checkbox"}
                aria-checked={selected}
                onClick={() => toggle(option)}
                className={`rounded-2xl border-2 px-4 py-2.5 text-base font-semibold transition-colors ${
                  selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-indigo-400"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (question.questionType === "long_text") {
    return (
      <>
        <label htmlFor={id} className="sr-only">Your answer</label>
        <textarea id={id} rows={3} maxLength={2000} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="Write your answer…" className={base} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">Your answer</label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        maxLength={300}
        autoComplete="off"
        inputMode={question.questionType === "number" ? "decimal" : "text"}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.questionType === "number" ? "Type a number…" : "Type your answer…"}
        className={`${base} ${question.questionType === "number" ? "max-w-xs" : ""}`}
      />
      {question.data.unit && <span className="text-lg font-semibold text-slate-600">{question.data.unit}</span>}
    </div>
  );
}
