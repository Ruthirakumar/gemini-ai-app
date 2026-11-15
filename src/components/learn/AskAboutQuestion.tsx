"use client";

import { FormEvent, useState } from "react";
import MicButton from "@/components/speech/MicButton";
import { ReadAloudButton, useSpeech } from "@/components/speech/SpeechProvider";
import { Button, inputClass } from "@/components/ui";
import { HISTORY_LIMIT, MAX_QUESTION_LENGTH, type ChatMessage } from "@/lib/ask/conversation";
import { errorMessage, fetchJson } from "@/lib/client/fetchJson";

/**
 * "Ask Buddy about this question": the child talks or types a question about
 * one homework question and Buddy's answer is read aloud. Buddy won't give the
 * answer away while the child still has tries left (decided on the server).
 */
export default function AskAboutQuestion({ attemptId, questionId }: { attemptId: string; questionId: string }) {
  const speech = useSpeech();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<(ChatMessage & { id: string })[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(raw: string) {
    const message = raw.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!message || loading) return;
    speech.stop();
    setError(null);
    const history = messages.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { id: `${questionId}-q${Date.now()}`, role: "user", content: message }]);
    setInput("");
    setLoading(true);
    try {
      const data = await fetchJson<{ reply: string }>(`/api/learn/attempts/${attemptId}/ask`, {
        method: "POST",
        json: { questionId, message, history },
      });
      const id = `${questionId}-a${Date.now()}`;
      setMessages((prev) => [...prev, { id, role: "assistant", content: data.reply }]);
      if (speech.autoRead) speech.speak(data.reply, id);
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1));
      setError(errorMessage(err));
      setInput(message);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
      >
        🙋 Ask Buddy about this question
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-indigo-900">🦉 Ask Buddy about this question</p>
        <button
          type="button"
          onClick={() => {
            speech.stop();
            setOpen(false);
          }}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
        >
          Close
        </button>
      </div>

      {messages.length === 0 && (
        <p className="text-sm text-slate-600">Not sure why? Tap 🎤 and ask, e.g. &quot;Why is that wrong?&quot; or &quot;Can you explain it another way?&quot;</p>
      )}
      {messages.map((m) =>
        m.role === "user" ? (
          <p key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-white">
            {m.content}
          </p>
        ) : (
          <div key={m.id} className="max-w-[90%]">
            <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3 py-2 text-slate-900 ring-1 ring-slate-200">{m.content}</p>
            <ReadAloudButton text={m.content} id={m.id} label="Read again" className="mt-0.5 text-xs" />
          </div>
        )
      )}
      {loading && <p role="status" className="animate-pulse text-sm text-slate-500">Buddy is thinking…</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}

      <MicButton onText={(text) => void ask(text)} disabled={loading} label="Ask by talking" listeningLabel="Listening… ask your question" />
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor={`ask-${questionId}`} className="sr-only">Your question for Buddy</label>
        <input
          id={`ask-${questionId}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          autoComplete="off"
          placeholder="Or type your question…"
          className={`${inputClass} flex-1`}
        />
        <Button type="submit" disabled={loading || !input.trim()}>Ask</Button>
      </form>
    </div>
  );
}
