"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { pickVoice, splitForSpeech, toSpeakableText } from "@/lib/ask/speech";

/* ------------------------------------------------------------------ */
/* Speech recognition (Web Speech API). Not in TypeScript's DOM types. */
/* ------------------------------------------------------------------ */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent extends Event {
  readonly error: string;
}
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

export type ListenError = "not-allowed" | "no-speech" | "audio-capture" | "network" | "unknown";
export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

/** The most a single question may be listened to for, so the mic never stays on. */
const MAX_LISTEN_MS = 20_000;

/**
 * Push-to-talk speech recognition. The microphone is only on between start()
 * and the end of one spoken question (or stop/cancel, the tab being hidden,
 * leaving the page, or 20 seconds), never in the background.
 */
export function useSpeechRecognition({ lang = "en-GB", onFinal }: { lang?: string; onFinal: (text: string) => void }) {
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<ListenError | null>(null);
  const [permission, setPermission] = useState<MicPermission>("unknown");

  const recognitionRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  // Read the microphone permission where the browser lets us (Chrome, Edge, Safari 16+).
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setPermission(status.state as MicPermission);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => {
        /* Firefox: not queryable. We find out when listening starts. */
      });
    return () => status?.removeEventListener("change", update);
  }, []);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /** Throws away whatever was heard and turns the microphone off. */
  const cancel = useCallback(() => {
    clearTimer();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      rec.abort();
    }
    setListening(false);
    setInterim("");
  }, []);

  /** Stops listening and uses what was heard so far. */
  const stop = useCallback(() => {
    clearTimer();
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false; // one question, then the mic turns off
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";
    rec.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else live += result[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = (event) => {
      const code: ListenError =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "not-allowed"
          : event.error === "no-speech" || event.error === "audio-capture" || event.error === "network"
            ? event.error
            : event.error === "aborted"
              ? "no-speech"
              : "unknown";
      if (code === "not-allowed") setPermission("denied");
      setError(code);
    };
    rec.onend = () => {
      clearTimer();
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text) {
        setPermission("granted");
        onFinalRef.current(text);
      }
    };

    setError(null);
    setInterim("");
    try {
      rec.start();
    } catch {
      setError("unknown");
      return;
    }
    recognitionRef.current = rec;
    setListening(true);
    timerRef.current = setTimeout(() => rec.stop(), MAX_LISTEN_MS);
  }, [lang]);

  // No background recording: switching tab/app or leaving the page turns the mic off.
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && cancel();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", cancel);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", cancel);
      cancel();
    };
  }, [cancel]);

  return { supported, listening, interim, error, permission, start, stop, cancel, clearError: () => setError(null) };
}

/* ------------------------------------------------------------------ */
/* Speech synthesis                                                    */
/* ------------------------------------------------------------------ */

// speechSynthesis.getVoices() returns a new array on every call and fills in
// asynchronously, so keep a cached copy for useSyncExternalStore.
let cachedVoices: SpeechSynthesisVoice[] = [];
const EMPTY_VOICES: SpeechSynthesisVoice[] = [];

function subscribeVoices(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  const update = () => {
    cachedVoices = window.speechSynthesis.getVoices();
    onChange();
  };
  update();
  window.speechSynthesis.addEventListener("voiceschanged", update);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
}

export type SpeakState = "idle" | "speaking" | "paused";

/** Reads text aloud in an English (UK) voice, with pause, resume and stop. */
export function useSpeechSynthesis({ rate = 0.95 }: { rate?: number } = {}) {
  const supported = useSyncExternalStore(noopSubscribe, () => "speechSynthesis" in window, () => false);
  const voices = useSyncExternalStore(subscribeVoices, () => cachedVoices, () => EMPTY_VOICES);
  const voice = pickVoice(voices);

  const [state, setState] = useState<SpeakState>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // Bumped on every speak/stop so events from cancelled speech are ignored.
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (text: string, id: string) => {
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      const run = ++runRef.current;
      synth.cancel();

      const pieces = splitForSpeech(toSpeakableText(text));
      if (pieces.length === 0) return;
      pieces.forEach((piece, i) => {
        const utterance = new SpeechSynthesisUtterance(piece);
        utterance.lang = voice?.lang ?? "en-GB";
        if (voice) utterance.voice = voice;
        utterance.rate = rate;
        utterance.pitch = 1.05;
        const finish = () => {
          if (runRef.current !== run) return;
          setState("idle");
          setSpeakingId(null);
        };
        if (i === pieces.length - 1) utterance.onend = finish;
        utterance.onerror = (event) => {
          if (event.error !== "interrupted" && event.error !== "canceled") finish();
        };
        synth.speak(utterance);
      });
      // Chrome can be left paused by an earlier pause(); make sure it plays.
      synth.resume();
      setState("speaking");
      setSpeakingId(id);
    },
    [voice, rate]
  );

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState("speaking");
  }, []);

  // Stop talking when leaving the page.
  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  return { supported, voiceName: voice?.name ?? null, state, speakingId, speak, pause, resume, stop };
}
