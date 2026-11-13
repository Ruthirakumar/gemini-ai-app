
"use client";

import { FormEvent, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const message = input.trim();

    if (!message || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to connect to Gemini.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 bg-gray-100 flex flex-col items-center p-6">
      <div className="w-full max-w-3xl flex-1 flex flex-col bg-white rounded-xl shadow-md p-6">

        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Gemini AI Chat
        </h1>

        <p className="text-sm text-gray-500 mb-6">
          Powered by Google Gemini
        </p>

        <div className="flex-1 space-y-4 overflow-y-auto mb-6 min-h-64">
          {messages.length === 0 && (
            <p className="text-gray-400 text-center mt-20">
              Ask Gemini anything...
            </p>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg max-w-[85%] whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-blue-600 text-white ml-auto"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {message.content}
            </div>
          ))}

          {loading && (
            <div className="text-gray-500 animate-pulse">
              Gemini is thinking...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
