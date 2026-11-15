"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorBanner, inputClass, PageHeader } from "@/components/ui";
import { HISTORY_LIMIT, MAX_QUESTION_LENGTH, type ChatMessage } from "@/lib/ask/conversation";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";
import { LISTEN_ERRORS } from "@/lib/client/listenErrors";
import { useSpeechRecognition, useSpeechSynthesis } from "@/lib/client/useSpeech";

interface Message extends ChatMessage {
  id: string;
}

type Mode = "talk" | "type";

const STARTERS = ["What is 7 times 8?", "Why do leaves change colour in autumn?", "What is a noun?", "How do I find a quarter of 20?"];

let nextId = 0;
const newId = () => `m${++nextId}`;

export default function AskBuddy() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<{ question: string; error: string } | null>(null);
  const [chosenMode, setChosenMode] = useState<Mode>("talk");
  const [readAloud, setReadAloud] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const speech = useSpeechSynthesis();
  const { speak, stop: stopSpeaking } = speech;
  const readAloudRef = useRef(readAloud);
  useEffect(() => {
    readAloudRef.current = readAloud;
  }, [readAloud]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, MAX_QUESTION_LENGTH);
      if (!question) return;
      stopSpeaking();
      setFailed(null);
      // Only answered exchanges are sent as history (a failed question is resent on retry).
      const history = messagesRef.current.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content }));
      setMessages((prev) => [...prev, { id: newId(), role: "user", content: question }]);
      setLoading(true);
      try {
        const data = await fetchJson<{ reply: string }>("/api/chat", { method: "POST", json: { message: question, history } });
        const reply: Message = { id: newId(), role: "assistant", content: data.reply };
        setMessages((prev) => [...prev, reply]);
        if (readAloudRef.current) speak(reply.content, reply.id);
      } catch (err) {
        // Remove the unanswered question so history stays question/answer pairs.
        setMessages((prev) => prev.slice(0, -1));
        setFailed({ question, error: errorMessage(err) });
      } finally {
        setLoading(false);
      }
    },
    [speak, stopSpeaking]
  );

  const listen = useSpeechRecognition({ onFinal: (text) => void ask(text) });
  const mode: Mode = listen.supported ? chosenMode : "type";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, listen.interim]);

  function startListening() {
    stopSpeaking(); // don't let the microphone hear Buddy talking
    listen.start();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (loading || !input.trim()) return;
    void ask(input);
    setInput("");
  }

  function newConversation() {
    listen.cancel();
    stopSpeaking();
    setMessages([]);
    setFailed(null);
    setInput("");
  }

  function switchMode(next: Mode) {
    if (next === "type") listen.cancel();
    listen.clearError();
    setChosenMode(next);
  }

  const busy = loading || listen.listening;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Ask Buddy"
        title="Ask me anything!"
        description="Talk or type a question about your schoolwork. Buddy explains it in a simple way and can read the answer out loud."
        actions={
          messages.length > 0 && (
            <Button variant="secondary" size="sm" onClick={newConversation}>
              ✨ New chat
            </Button>
          )
        }
      />

      {/* Settings */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="How do you want to ask?" className="inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
          {(["talk", "type"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={m === "talk" && !listen.supported}
              onClick={() => switchMode(m)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m ? "bg-indigo-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {m === "talk" ? "🎤 Talk" : "⌨️ Type"}
            </button>
          ))}
        </div>
        {speech.supported && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={readAloud}
              onChange={(e) => {
                setReadAloud(e.target.checked);
                if (!e.target.checked) stopSpeaking();
              }}
            />
            🔊 Read answers aloud
          </label>
        )}
      </div>

      {!listen.supported && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Talking to Buddy isn&apos;t available in this browser, so you can type your questions instead. (It works in Chrome, Edge and Safari.)
        </p>
      )}

      {/* Conversation */}
      <section
        aria-label="Conversation"
        className="min-h-72 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        {messages.length === 0 && !loading && !listen.listening && (
          <div className="py-6 text-center">
            <p className="text-4xl" aria-hidden>
              🦉
            </p>
            <p className="mt-2 font-semibold text-slate-800">Hi! I&apos;m Buddy. What would you like to know?</p>
            <p className="mt-1 text-sm text-slate-500">Try one of these:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-white">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="flex max-w-[90%] gap-2">
              <span aria-hidden className="mt-1 text-2xl">
                🦉
              </span>
              <div>
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-lg leading-relaxed text-slate-900">
                  {m.content}
                </div>
                {speech.supported && (
                  <button
                    type="button"
                    onClick={() => (speech.speakingId === m.id ? stopSpeaking() : speak(m.content, m.id))}
                    className="mt-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  >
                    {speech.speakingId === m.id ? "⏹ Stop reading" : "🔊 Read aloud"}
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {listen.listening && (
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md border-2 border-dashed border-indigo-300 px-4 py-3 text-indigo-900" aria-hidden>
            {listen.interim || "…"}
          </div>
        )}
        {loading && (
          <p role="status" className="flex items-center gap-2 text-slate-500">
            <span aria-hidden className="text-2xl">
              🦉
            </span>
            <span className="animate-pulse">Buddy is thinking…</span>
          </p>
        )}
        <div ref={bottomRef} />
      </section>

      {failed && <ErrorBanner message={failed.error} onRetry={() => void ask(failed.question)} />}

      {/* Reading-aloud controls */}
      {speech.state !== "idle" && (
        <div
          role="region"
          aria-label="Reading aloud"
          className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg"
        >
          <span className="mr-auto text-sm font-medium">{speech.state === "paused" ? "⏸ Paused" : "🔊 Buddy is talking…"}</span>
          {speech.state === "speaking" ? (
            <Button size="sm" variant="secondary" onClick={speech.pause}>
              ⏸ Pause
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={speech.resume}>
              ▶ Resume
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={stopSpeaking}>
            ⏹ Stop
          </Button>
        </div>
      )}

      {/* Asking */}
      {mode === "talk" ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {listen.listening ? (
            <>
              <p role="status" className="flex items-center gap-2 font-semibold text-rose-700">
                <span className="relative flex h-3 w-3" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600" />
                </span>
                Microphone on: I&apos;m listening…
              </p>
              <button
                type="button"
                onClick={listen.stop}
                aria-label="Stop listening and ask"
                className="grid h-24 w-24 place-items-center rounded-full bg-rose-600 text-4xl text-white shadow-lg ring-8 ring-rose-100 transition hover:bg-rose-700"
              >
                ⏹
              </button>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600">Tap to finish.</span>
                <Button size="sm" variant="ghost" onClick={listen.cancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startListening}
                disabled={loading}
                aria-label="Tap and ask your question"
                className="grid h-24 w-24 place-items-center rounded-full bg-indigo-600 text-4xl text-white shadow-lg ring-8 ring-indigo-100 transition hover:bg-indigo-700 disabled:bg-slate-300 disabled:ring-slate-100"
              >
                🎤
              </button>
              <p className="text-sm font-medium text-slate-700">
                {loading ? "Wait for Buddy's answer…" : messages.length > 0 ? "Tap to ask another question" : "Tap and ask your question"}
              </p>
              <p className="text-center text-xs text-slate-500">
                The microphone is only on while you&apos;re asking and switches off by itself. Homework Buddy doesn&apos;t save your questions.
              </p>
            </>
          )}
          {listen.error && !listen.listening && (
            <p role="alert" className="max-w-md rounded-xl bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 ring-1 ring-amber-200">
              {LISTEN_ERRORS[listen.error]}
            </p>
          )}
          {listen.permission === "denied" && !listen.error && (
            <p className="max-w-md text-center text-sm text-amber-900">
              The microphone is blocked for this site. A grown-up can allow it from the padlock next to the web address.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="flex gap-3">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <input
            id="ask-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            maxLength={MAX_QUESTION_LENGTH}
            autoComplete="off"
            className={`${inputClass} flex-1 text-base`}
          />
          <Button type="submit" size="lg" disabled={busy || !input.trim()}>
            Ask
          </Button>
        </form>
      )}
    </div>
  );
}
