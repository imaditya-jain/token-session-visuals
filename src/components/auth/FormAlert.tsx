import type { ApiFailure } from "@/features/auth/types";

/** Human-friendly message for an API failure (rate limits explain how long to wait). */
export function failureMessage(failure: ApiFailure): string {
  if ((failure.status === 429 || failure.code === "account_locked") && failure.retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(failure.retryAfterSeconds / 60));
    return `${failure.message} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return failure.message;
}

export default function FormAlert({ failure }: { failure: ApiFailure | null }) {
  if (!failure) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {failureMessage(failure)}
    </div>
  );
}
