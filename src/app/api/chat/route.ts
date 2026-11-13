import { NextRequest, NextResponse } from "next/server";
import {
  gemini,
  GEMINI_MODEL,
  getGeminiErrorStatus,
  isRetryableGeminiError,
  withGeminiRetry,
} from "@/lib/gemini";

async function generateWithRetry(message: string) {
  return withGeminiRetry(() =>
    gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: message,
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Please provide a valid message." },
        { status: 400 }
      );
    }

    if (message.length > 10000) {
      return NextResponse.json(
        { error: "Message is too long." },
        { status: 400 }
      );
    }

    const response = await generateWithRetry(message);

    return NextResponse.json({
      success: true,
      reply: response.text ?? "No response generated.",
    });

  } catch (error: unknown) {
    console.error("Gemini API error:", error);

    const status = getGeminiErrorStatus(error);
    const isTemporary = isRetryableGeminiError(error);

    return NextResponse.json(
      {
        success: false,
        error: isTemporary
          ? "Gemini is temporarily unavailable. Please try again shortly."
          : "Unable to generate a response. Please try again.",
      },
      { status: isTemporary ? status : 500 }
    );
  }
}
