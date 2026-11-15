"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { useSpeechSynthesis } from "@/lib/client/useSpeech";

type Speech = ReturnType<typeof useSpeechSynthesis> & {
  /** Read feedback and Buddy's answers aloud automatically. */
  autoRead: boolean;
  setAutoRead: (on: boolean) => void;
};

const SpeechContext = createContext<Speech | null>(null);

/**
 * One voice for a whole screen: whatever is read aloud replaces what was being
 * read before, and one Pause / Resume / Stop bar controls it.
 */
export function SpeechProvider({ children }: { children: ReactNode }) {
  const synth = useSpeechSynthesis();
  const [autoRead, setAutoRead] = useState(true);
  return (
    <SpeechContext.Provider value={{ ...synth, autoRead, setAutoRead }}>
      {children}
      {synth.state !== "idle" && (
        <div
          role="region"
          aria-label="Reading aloud"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl"
        >
          <span className="mr-auto text-sm font-medium">{synth.state === "paused" ? "⏸ Paused" : "🔊 Buddy is talking…"}</span>
          {synth.state === "speaking" ? (
            <Button size="sm" variant="secondary" onClick={synth.pause}>⏸ Pause</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={synth.resume}>▶ Resume</Button>
          )}
          <Button size="sm" variant="danger" onClick={synth.stop}>⏹ Stop</Button>
        </div>
      )}
    </SpeechContext.Provider>
  );
}

export function useSpeech(): Speech {
  const ctx = useContext(SpeechContext);
  if (!ctx) throw new Error("useSpeech must be used inside <SpeechProvider>");
  return ctx;
}

/** A small "🔊 Read to me" button. Tapping it again while it's reading stops it. */
export function ReadAloudButton({
  text,
  id,
  label = "Read to me",
  rate,
  className = "",
}: {
  text: string | string[];
  id: string;
  label?: string;
  rate?: number;
  className?: string;
}) {
  const speech = useSpeech();
  if (!speech.supported) return null;
  const active = speech.speakingId === id;
  return (
    <button
      type="button"
      onClick={() => (active ? speech.stop() : speech.speak(text, id, { rate }))}
      aria-label={active ? "Stop reading" : label}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 ${className}`}
    >
      {active ? "⏹ Stop" : `🔊 ${label}`}
    </button>
  );
}
