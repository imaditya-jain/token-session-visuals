import type { ZodError } from "zod";

import type { ApiFailure } from "@/features/auth/types";

export type FieldErrors = Record<string, string>;

/** First message per field from client-side zod validation. */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Server-side field errors (validation_error) mapped to the same shape. */
export function fieldErrorsFromFailure(failure: ApiFailure): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of failure.fields ?? []) errors[field.path] ??= field.message;
  return errors;
}
