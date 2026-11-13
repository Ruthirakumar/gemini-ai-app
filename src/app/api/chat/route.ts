
import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

const MAX_ATTEMPTS = 3;

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(message: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: message,
      });
    } catch (error: unknown) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error
          ? Number(error.status)
          : undefined;

      const retryable = [429, 500, 502, 503, 504].includes(
        status ?? 0
      );

      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      const waitTime = 1000 * Math.pow(2, attempt - 1);

      console.log(
        `Gemini error ${status}. Retry ${attempt + 1}/${MAX_ATTEMPTS} in ${waitTime}ms`
      );

      await delay(waitTime);
    }
  }

  throw new Error("Gemini request failed.");
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

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error
        ? Number(error.status)
        : undefined;

    const isTemporary = [429, 500, 502, 503, 504].includes(
      status ?? 0
    );

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
