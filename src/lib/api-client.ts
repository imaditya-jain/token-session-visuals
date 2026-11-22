import { signedOut, tokenRefreshed } from "@/features/auth/authSlice";
import type { ApiFailure } from "@/features/auth/types";
import type { AppStore } from "@/store";

/**
 * Browser API client. Sends the in-memory access token as `Authorization: Bearer` on every call; when it is
 * missing or expired it obtains a new one from the refresh cookie (single-flight, so parallel calls share one
 * refresh) and retries once.
 */
let store: AppStore | undefined;
let inflightRefresh: Promise<boolean> | undefined;

/** Called once by the Redux provider. */
export function bindStore(next: AppStore): void {
  store = next;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { path: string; message: string }[],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON(): ApiFailure {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      ...(this.fields ? { fields: this.fields } : {}),
      ...(this.retryAfterSeconds ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
    };
  }
}

const REFRESH_SKEW_MS = 30_000;
const RETRYABLE_CODES = new Set(["token_expired", "invalid_token", "unauthorized"]);

function requireStore(): AppStore {
  if (!store) throw new Error("API client used before the store was bound");
  return store;
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = (text ? safeJson(text) : null) as {
    data?: T;
    error?: { code: string; message: string; fields?: { path: string; message: string }[] };
  } | null;
  if (response.ok) return (body && "data" in body ? body.data : undefined) as T;
  const retryAfter = Number(response.headers.get("retry-after")) || undefined;
  throw new ApiError(
    response.status,
    body?.error?.code ?? "request_failed",
    body?.error?.message ?? "Something went wrong. Please try again.",
    body?.error?.fields,
    retryAfter,
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Exchanges the refresh cookie for a new access token. Resolves false (and signs out) if there is no valid session. */
export function refreshAccessToken(): Promise<boolean> {
  inflightRefresh ??= (async () => {
    const { dispatch } = requireStore();
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (response.ok) {
        const { data } = (await response.json()) as {
          data: { accessToken: string; expiresIn: number };
        };
        dispatch(tokenRefreshed(data));
        return true;
      }
      dispatch(signedOut());
      return false;
    } catch {
      // Network failure: keep the session, the caller will see the error.
      return false;
    } finally {
      inflightRefresh = undefined;
    }
  })();
  return inflightRefresh;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  /** Multipart upload (the browser sets the boundary, so no Content-Type is sent). */
  form?: FormData;
};

/** Public calls (login, register): no token involved. */
export async function postJson<T>(path: string, json: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return parse<T>(response);
}

/** Public call with any method (guest cart): cookie-authorised, no bearer token involved. */
export async function publicJson<T>(path: string, method: string, json?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    ...(json !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }
      : {}),
  });
  return parse<T>(response);
}

/** Authenticated request with automatic refresh-and-retry. Returns the raw response (JSON parsing is the caller's job). */
async function authedFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { json, form, headers, ...init } = options;
  const { getState } = requireStore();

  const send = () => {
    const token = getState().auth.accessToken;
    return fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      ...(form ? { body: form } : {}),
    });
  };

  const { accessToken, expiresAt } = getState().auth;
  if (!accessToken || (expiresAt !== null && expiresAt - Date.now() < REFRESH_SKEW_MS)) {
    if (!(await refreshAccessToken())) throw new ApiError(401, "no_session", "Please sign in.");
  }

  let response = await send();
  if (response.status === 401) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: { code?: string } } | null;
    if (RETRYABLE_CODES.has(body?.error?.code ?? "") && (await refreshAccessToken())) {
      response = await send();
    }
  }
  return response;
}

/** Authenticated call with automatic refresh-and-retry. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return parse<T>(await authedFetch(path, options));
}

/** Authenticated file download (for example a CSV export). Failures surface as `ApiError` like any other call. */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await authedFetch(path);
  if (!response.ok) return parse<never>(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "download";
  return { blob: await response.blob(), filename };
}
