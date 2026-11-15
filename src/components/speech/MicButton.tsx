"use client";

import { useSpeech } from "@/components/speech/SpeechProvider";
import { LISTEN_ERRORS } from "@/lib/client/listenErrors";
import { useSpeechRecognition } from "@/lib/client/useSpeech";

/**
 * Push-to-talk button: the child says something and it becomes text.
 * The microphone is only on while the red "Listening" bar shows.
 */
export default function MicButton({
  onText,
  disabled,
  label = "Say it",
  listeningLabel = "Listening… say your answer",
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  label?: string;
  listeningLabel?: string;
}) {
  const speech = useSpeech();
  const listen = useSpeechRecognition({ onFinal: onText });
  if (!listen.supported) return null;

  if (listen.listening) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
        <span role="status" className="flex items-center gap-2 text-sm font-semibold text-rose-800">
          <span className="relative flex h-3 w-3" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600" />
          </span>
          {listeningLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm italic text-rose-900">{listen.interim}</span>
        <button type="button" onClick={listen.stop} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700">
          ⏹ Done
        </button>
        <button type="button" onClick={listen.cancel} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          speech.stop(); // the microphone mustn't hear Buddy talking
          listen.start();
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🎤 {label}
      </button>
      {listen.error && <p role="alert" className="text-sm text-amber-900">{LISTEN_ERRORS[listen.error]}</p>}
    </div>
  );
}
