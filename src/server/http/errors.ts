import "server-only";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new AppError(400, code, message);
export const unauthorized = (message = "Authentication required", code = "unauthorized") =>
  new AppError(401, code, message, { "WWW-Authenticate": 'Bearer realm="fernwood"' });
export const forbidden = (message = "Forbidden", code = "forbidden") =>
  new AppError(403, code, message);
export const notFound = (message = "Not found", code = "not_found") =>
  new AppError(404, code, message);
export const conflict = (message: string, code = "conflict") => new AppError(409, code, message);
export const tooManyRequests = (retryAfterSeconds: number) =>
  new AppError(429, "rate_limited", "Too many requests. Please try again later.", {
    "Retry-After": String(retryAfterSeconds),
  });
