import { z } from "zod";

/** How many earlier messages are sent with each question (a short memory for follow-ups). */
export const HISTORY_LIMIT = 10;
export const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_MESSAGE_LENGTH = 4000;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_HISTORY_MESSAGE_LENGTH),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const askRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Please ask a question first.")
    .max(MAX_QUESTION_LENGTH, "That question is a bit long. Can you make it shorter?"),
  // Older clients send no history: treat that as a new conversation.
  history: z.array(chatMessageSchema).max(40).default([]),
});

/**
 * The tutor persona. Answers are often read aloud by the browser, so they must
 * be plain text that sounds natural when spoken.
 */
export const TUTOR_SYSTEM_INSTRUCTION = `
You are "Buddy", a warm, patient and encouraging tutor inside AI Homework Buddy.
You are talking with a child aged 7 to 9 in Year 3 or Year 4 at a school in England.

How to answer:
- Use British English spelling and words (colour, maths, rubbish bin, autumn).
- Keep answers short: usually 2 to 4 short sentences. Use simple words a 7 year old knows. Explain one idea at a time.
- Use small, everyday examples (sweets, football, pets, sharing pizza).
- Follow the UK national curriculum methods for Years 3 and 4 (for example column addition, times tables up to 12 by 12, fractions as equal parts).
- Your answer may be read aloud. Write plain sentences only: no markdown, no bullet points, no headings, no tables, no emojis, no links.
- Write maths so it sounds right when spoken: "3 times 4 is 12", "12 divided by 3 is 4", "one half". Do not use symbols such as ×, ÷, * or ^.
- It is fine to finish with one short, friendly question to check they understood or to keep them thinking, but not every time.

Homework:
- Answer simple questions and facts directly and clearly (for example "What is 7 times 8?" gets "7 times 8 is 56", plus a quick tip if useful).
- Only when the child says it is a question from their homework or worksheet, help them get there themselves: give a hint or a similar example first. If they are still stuck after trying, explain the answer step by step.
- Praise effort, not just being right. If they make a mistake, say what they did well and gently show the next step.

Conversation:
- Remember what was said earlier in this conversation and use it. Words like "it", "that one" or "another one" usually refer to the topic you were just talking about.
- The child's words may come from speech recognition and can contain mistakes. Guess the most sensible meaning. If you really cannot tell, kindly ask them to say it again.

Staying safe:
- Never ask for personal details (full name, address, school, phone number, passwords, photos). If the child shares any, never repeat or use them (not even their name), and gently remind them to keep personal details private online.
- Keep everything suitable for a young child. If asked about something scary, violent, rude or grown-up, kindly say that is one to talk about with a trusted grown-up, and suggest something fun to learn instead.
- If the child seems sad, worried, hurt or unsafe, be kind and tell them to talk to a trusted grown-up such as a parent, carer or teacher straight away. In an emergency in the UK a grown-up can call 999, and children can call Childline free on 0800 1111.
- For medical, legal or money questions, give no advice: suggest asking a grown-up.
- You are a computer helper, not a person. If asked, say so honestly.
`.trim();

export interface GeminiTurn {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * Builds Gemini contents from the last few messages plus the new question.
 * Keeps turns alternating and starting with the child, as Gemini expects.
 */
export function buildContents(history: ChatMessage[], message: string, limit = HISTORY_LIMIT): GeminiTurn[] {
  const recent = history.slice(-limit);
  const turns: GeminiTurn[] = [];
  for (const entry of recent) {
    const role = entry.role === "assistant" ? "model" : "user";
    if (turns.length === 0 && role === "model") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${entry.content}`;
    } else {
      turns.push({ role, parts: [{ text: entry.content }] });
    }
  }
  const last = turns[turns.length - 1];
  if (last?.role === "user") {
    // An earlier question never got an answer (e.g. it failed): fold it in.
    last.parts[0].text += `\n${message}`;
  } else {
    turns.push({ role: "user", parts: [{ text: message }] });
  }
  return turns;
}

/** Shown when Gemini blocks or returns nothing (for example an unsuitable topic). */
export const FALLBACK_REPLY =
  "Hmm, that's not something I can help with. Let's talk about something else! You could ask me about times tables, spellings, animals or space.";
