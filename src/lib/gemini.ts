import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is missing");
}

export const gemini = new GoogleGenAI({ apiKey });

export const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

/**
 * Model used for reading/marking homework images. Falls back to GEMINI_MODEL,
 * so no configuration change is required. Set GEMINI_HOMEWORK_MODEL to use a
 * stronger vision model for handwriting without affecting chat.
 */
export const GEMINI_HOMEWORK_MODEL =
  process.env.GEMINI_HOMEWORK_MODEL || GEMINI_MODEL;

/** HTTP statuses from Gemini that are worth retrying a limited number of times. */
export const RETRYABLE_STATUSES = [429, 500, 502, 503, 504] as const;

export function getGeminiErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

export function isRetryableGeminiError(error: unknown): boolean {
  const status = getGeminiErrorStatus(error);
  return (RETRYABLE_STATUSES as readonly number[]).includes(status ?? 0);
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a Gemini call with bounded exponential backoff on temporary errors.
 * Never retries indefinitely: at most `maxAttempts` calls are made.
 */
export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  { maxAttempts = 3, label = "Gemini" }: { maxAttempts?: number; label?: string } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (!isRetryableGeminiError(error) || attempt === maxAttempts) {
        throw error;
      }

      const waitTime = 1000 * Math.pow(2, attempt - 1);
      console.log(
        `${label} error ${getGeminiErrorStatus(error)}. Retry ${attempt + 1}/${maxAttempts} in ${waitTime}ms`
      );
      await delay(waitTime);
    }
  }

  throw new Error(`${label} request failed.`);
}
