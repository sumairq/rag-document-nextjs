/**
 * Maps internal/provider errors to clean, user-facing messages so we never leak
 * raw SDK error JSON or stack traces to the UI. The original error should still
 * be logged server-side for debugging.
 */

export interface ClassifiedError {
  status: number;
  message: string;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Classify an error for an HTTP response.
 *
 * @param kind "chat" for query/generation, "ingest" for upload/parsing — only
 *   affects how non-provider (file/parse) errors are treated.
 */
export function classifyError(
  err: unknown,
  kind: "chat" | "ingest",
): ClassifiedError {
  const text = errorText(err);

  // --- Provider errors (apply to both kinds) ---
  if (/RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b/i.test(text)) {
    return {
      status: 429,
      message:
        "The AI service is rate-limited right now. Please wait a moment and try again.",
    };
  }
  if (/API key|API_KEY|GEMINI_API_KEY|permission denied|\b401\b|\b403\b/i.test(text)) {
    return {
      status: 503,
      message: "The AI service isn’t configured correctly on the server.",
    };
  }
  if (/UNAVAILABLE|overloaded|temporarily|\b503\b|\b502\b|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(text)) {
    return {
      status: 503,
      message: "The AI service is temporarily unavailable. Please try again.",
    };
  }

  if (kind === "ingest") {
    // These messages are authored to be user-friendly already (thrown by our
    // own prepare/parser code) — pass them through as 400s.
    if (/unsupported file type|no selectable text|no extractable text|empty|too large for the demo/i.test(text)) {
      return { status: 400, message: text };
    }
    // Any other parse failure is almost always a bad/corrupt input file.
    return {
      status: 400,
      message:
        "Couldn’t read this file — it may be corrupt, password-protected, or not a valid document.",
    };
  }

  // chat / generic fallback
  return { status: 500, message: "Something went wrong. Please try again." };
}
