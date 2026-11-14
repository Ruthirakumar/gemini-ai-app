"use client";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** fetch + JSON with friendly errors. API routes return { success, error, code }. */
export async function fetchJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiClientError("Can't reach Homework Buddy. Please check your internet connection.", 0, "network");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response */
  }

  const body = data as { success?: boolean; error?: string; code?: string } | null;
  if (!response.ok || body?.success === false) {
    throw new ApiClientError(
      body?.error ?? "Something went wrong. Please try again.",
      response.status,
      body?.code ?? "unknown"
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
