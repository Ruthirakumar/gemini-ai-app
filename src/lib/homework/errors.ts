import { NextResponse } from "next/server";
import { getGeminiErrorStatus } from "@/lib/gemini";
import type { ApiErrorResponse } from "./types";

/** An error whose message is safe and friendly to show to a student. */
export class HomeworkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "HomeworkError";
  }
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError" || /aborted|timed? ?out/i.test(error.message))
  );
}

/** Converts any error into a friendly JSON response. Never leaks internal details. */
export function toErrorResponse(error: unknown, context: string): NextResponse<ApiErrorResponse> {
  if (error instanceof HomeworkError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }

  const status = getGeminiErrorStatus(error);
  // Log status/name only: the error message may echo request content.
  console.error(`[${context}] failed`, {
    status,
    name: error instanceof Error ? error.name : typeof error,
  });

  let response: { status: number; code: string; message: string };

  if (isTimeout(error)) {
    response = {
      status: 504,
      code: "timeout",
      message: "Checking took too long this time. Please try again, perhaps with a smaller or clearer photo.",
    };
  } else if (status === 429) {
    response = {
      status: 429,
      code: "rate_limited",
      message: "Homework Buddy is very busy right now. Please wait a minute and try again.",
    };
  } else if (status !== undefined && status >= 500) {
    response = {
      status: 503,
      code: "ai_unavailable",
      message: "Homework Buddy can't reach its marking helper at the moment. Please try again in a little while.",
    };
  } else if (
    status === 401 ||
    status === 403 ||
    status === 404 || // unknown GEMINI_MODEL
    (status === 400 && error instanceof Error && /api[ _-]?key/i.test(error.message))
  ) {
    // Gemini reports an invalid API key as HTTP 400.
    response = {
      status: 500,
      code: "ai_config",
      message: "Homework Buddy isn't set up correctly. Please ask a grown-up to check the settings.",
    };
  } else if (status === 400) {
    response = {
      status: 422,
      code: "ai_rejected",
      message: "Homework Buddy couldn't process that picture. Please try a different photo.",
    };
  } else {
    response = {
      status: 500,
      code: "unknown",
      message: "Something went wrong while checking your homework. Please try again.",
    };
  }

  return NextResponse.json(
    { success: false, error: response.message, code: response.code },
    { status: response.status }
  );
}
