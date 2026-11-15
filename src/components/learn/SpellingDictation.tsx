"use client";

import { useState } from "react";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui";
import type { SpellingList } from "@/lib/learn/spelling";

type Mode = "learn" | "test" | "check";

const SLOW = 0.6;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Spelling list practice. "Learn" shows the words (tap to hear one).
 * "Test me" hides them and Buddy says each word for the child to write on
 * paper; at the end the words are shown so they can tick their own spellings.
 */
export default function SpellingDictation({ list, id }: { list: SpellingList; id: string }) {
  const speech = useSpeech();
  const [mode, setMode] = useState<Mode>("learn");
  const [order, setOrder] = useState<string[]>(list.words);
  const [mix, setMix] = useState(false);
  const [index, setIndex] = useState(0);

  const sayWord = (words: string[], i: number, slow = false) => {
    const word = words[i];
    if (!word) return;
    if (slow) speech.speak(word, `${id}-test`, { rate: SLOW });
    else speech.speak([`Number ${i + 1}.`, `${word}.`, `${word}.`], `${id}-test`);
  };

  function startTest() {
    const words = mix ? shuffled(list.words) : list.words;
    setOrder(words);
    setIndex(0);
    setMode("test");
    sayWord(words, 0);
  }

  function goTo(i: number) {
    setIndex(i);
    sayWord(order, i);
  }

  if (!speech.supported) {
    return (
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
        This browser can&apos;t read words aloud, so ask a grown-up to read your spellings to you. Words: {list.words.join(", ")}
      </p>
    );
  }

  if (mode === "test") {
    const last = index === order.length - 1;
    return (
      <div className="rounded-3xl border-2 border-indigo-200 bg-indigo-50/60 p-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Spelling test</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">
          Word {index + 1} <span className="text-lg font-medium text-slate-500">of {order.length}</span>
        </p>
        <p className="mt-2 text-slate-700">✏️ Listen, then write the word on your paper.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => sayWord(order, index)}>🔊 Say it again</Button>
          <Button size="lg" variant="secondary" onClick={() => sayWord(order, index, true)}>🐢 Say it slowly</Button>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>← Back</Button>
          {last ? (
            <Button
              onClick={() => {
                speech.stop();
                setMode("check");
              }}
            >
              I&apos;ve written them all ✓
            </Button>
          ) : (
            <Button onClick={() => goTo(index + 1)}>Next word →</Button>
          )}
        </div>
        <button type="button" onClick={() => { speech.stop(); setMode("learn"); }} className="mt-4 text-sm font-semibold text-slate-600 hover:underline">
          Stop the test
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "check" && (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">
          <p className="font-semibold">🎉 Well done! Now check your paper.</p>
          <p className="text-sm">Put a tick next to each word you spelt correctly. Practise any you got wrong: read, cover, write, check.</p>
        </div>
      )}
      <ol className="flex flex-wrap gap-2">
        {(mode === "check" ? order : list.words).map((word, i) => (
          <li key={word}>
            <button
              type="button"
              onClick={() => speech.speak(word, `${id}-w-${word}`)}
              className="rounded-xl bg-white px-3 py-2 text-lg font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-indigo-50 hover:ring-indigo-300"
              aria-label={`Hear ${word}`}
            >
              {mode === "check" && <span className="mr-1.5 text-sm font-normal text-slate-500">{i + 1}.</span>}
              {word} <span aria-hidden className="text-sm">🔊</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-slate-700">
          {mode === "check"
            ? "Want another go?"
            : "Tap a word to hear it. When you've learnt them, Buddy can test you: it says each word and you write it on paper."}
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={mix} onChange={(e) => setMix(e.target.checked)} />
          🔀 Mix up the order
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={startTest}>{mode === "check" ? "↻ Test me again" : "🎧 Test me"}</Button>
          <Button size="lg" variant="secondary" onClick={() => speech.speak(list.words.map((w) => `${w}.`), `${id}-all`)}>
            🔊 Read all the words
          </Button>
        </div>
      </div>
    </div>
  );
}
