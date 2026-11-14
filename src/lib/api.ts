import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { HomeworkError, toErrorResponse } from "@/lib/homework/errors";

/** Wraps a route handler so every error becomes a friendly JSON response. */
export function route<Args extends unknown[]>(context: string, handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      // Let Next.js's own control-flow errors (e.g. "this route needs request
      // data" during prerendering) propagate instead of becoming a 500.
      unstable_rethrow(error);
      return toErrorResponse(error, context);
    }
  };
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HomeworkError(400, "bad_request", "Something went wrong sending that. Please try again.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HomeworkError(400, "invalid_input", first?.message && !first.message.startsWith("Invalid") ? first.message : "Some of the details aren't valid. Please check and try again.");
  }
  return parsed.data;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true as const, ...data }, init);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, what = "item"): string {
  if (!UUID.test(value)) throw new HomeworkError(404, "not_found", `That ${what} couldn't be found.`);
  return value;
}
