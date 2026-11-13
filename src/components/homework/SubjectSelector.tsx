"use client";

import type { SubjectOption } from "@/lib/homework/constants";

const OPTIONS: { value: SubjectOption; label: string; icon: string; hint: string }[] = [
  { value: "english", label: "English", icon: "📖", hint: "Spelling, grammar, reading" },
  { value: "maths", label: "Maths", icon: "🔢", hint: "Sums, fractions, problems" },
  { value: "auto", label: "Auto detect", icon: "✨", hint: "Let Buddy work it out" },
];

interface Props {
  value: SubjectOption;
  onChange: (value: SubjectOption) => void;
  disabled?: boolean;
}

export default function SubjectSelector({ value, onChange, disabled }: Props) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-3 text-sm font-semibold text-slate-700">1. Which subject is it?</legend>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 has-[:focus-visible]:ring-offset-2 sm:px-4 sm:py-4 ${
                selected
                  ? "border-indigo-600 bg-indigo-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="subject"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span aria-hidden className="text-2xl">{option.icon}</span>
              <span className={`text-sm font-semibold sm:text-base ${selected ? "text-indigo-700" : "text-slate-800"}`}>
                {option.label}
              </span>
              <span className="hidden text-xs text-slate-500 sm:block">{option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
