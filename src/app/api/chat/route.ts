import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api";
import { askRequestSchema, buildContents, FALLBACK_REPLY, TUTOR_SYSTEM_INSTRUCTION } from "@/lib/ask/conversation";
import { gemini, GEMINI_MODEL, USER_ACTION_ATTEMPTS, withGeminiRetry } from "@/lib/gemini";

// Stricter than Gemini's defaults: the people asking are 7-9 years old.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

/**
 * POST { message, history } – the Ask tab. `history` is the last few messages of
 * this conversation (kept only in the browser, never stored) so follow-up
 * questions make sense.
 */
export const POST = route("ask", async (request: NextRequest) => {
  const { message, history } = await readJson(request, askRequestSchema);

  const response = await withGeminiRetry(
    () =>
      gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildContents(history, message),
        config: {
          systemInstruction: TUTOR_SYSTEM_INSTRUCTION,
          temperature: 0.6,
          maxOutputTokens: 2048,
          safetySettings: SAFETY_SETTINGS,
        },
      }),
    { maxAttempts: USER_ACTION_ATTEMPTS, label: "Ask" }
  );

  const reply = response.text?.trim();
  if (!reply) console.warn("[ask] empty reply", { finishReason: response.candidates?.[0]?.finishReason, blocked: response.promptFeedback?.blockReason });
  return ok({ reply: reply || FALLBACK_REPLY });
});
