import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_HEADERS = ["authorization", "cookie", "set-cookie", "x-forwarded-for", "x-real-ip"];
/** URLs here can carry one-time tokens (`/reset-password?token=…`), so only the path is ever reported. */
const stripQuery = (value: unknown): unknown =>
  typeof value === "string" ? value.split(/[?#]/)[0] : value;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Removes personal data from an event before it leaves our infrastructure: credentials, cookies, client IPs, the
 * request body and query string, the user object, and anything that looks like an email address in messages.
 * Used on both server and browser; errors must be debuggable from the stack, request id and route alone.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url) as string;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers))
        if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete event.request.headers[name];
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = crumb.message.replace(EMAIL, "[email]");
    for (const key of ["url", "from", "to"] as const)
      if (crumb.data && key in crumb.data) crumb.data[key] = stripQuery(crumb.data[key]);
  }
  delete event.user;
  if (event.message) event.message = event.message.replace(EMAIL, "[email]");
  for (const exception of event.exception?.values ?? [])
    if (exception.value) exception.value = exception.value.replace(EMAIL, "[email]");
  return event;
}
