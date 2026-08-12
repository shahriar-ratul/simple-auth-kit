import { AuthApiError } from "@easy-auth/auth-client";

export function errorMessage(err: unknown): string {
  if (err instanceof AuthApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

/**
 * For the destructive alert block every form shows on submit error. `AuthApiError#message` is
 * typed as a plain string, but backend validation errors are sometimes joined with newlines (or,
 * on a shape this client doesn't guarantee, arrive as an actual array) — this normalizes either
 * into one bullet list rather than a single run-on line.
 */
export function errorMessages(err: unknown): string[] {
  const raw: unknown = err instanceof AuthApiError || err instanceof Error ? err.message : err;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.length > 0 ? lines : ["Something went wrong."];
  }
  return ["Something went wrong."];
}
