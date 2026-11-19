import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStarted } from "@/features/auth/authSlice";
import { restoreSession } from "@/features/auth/authThunks";
import { makeStore, type AppStore } from "@/store";

import { ApiError, apiFetch, bindStore, postJson } from "./api-client";

const user = {
  id: "1",
  email: "a@b.co",
  firstName: "A",
  lastName: "B",
  role: "customer" as const,
  acceptsMarketing: false,
  emailVerified: true,
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

let store: AppStore;
const authHeader = (call: unknown[]) =>
  ((call[1] as RequestInit).headers as Record<string, string>)["Authorization"];

beforeEach(() => {
  store = makeStore();
  bindStore(store);
  store.dispatch(sessionStarted({ user, accessToken: "token-1", expiresIn: 900 }));
});
afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = "fw_auth=; Max-Age=0; path=/";
});

describe("apiFetch", () => {
  it("sends the in-memory access token as a Bearer header and unwraps { data }", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => json({ data: { ok: 1 } }));
    await expect(apiFetch("/api/me")).resolves.toEqual({ ok: 1 });
    expect(authHeader(fetchMock.mock.calls[0]!)).toBe("Bearer token-1");
  });

  it("refreshes once on an expired token and retries the original request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/auth/refresh")
        return json({ data: { accessToken: "token-2", expiresIn: 900 } });
      return fetchMock.mock.calls.filter(([u]) => String(u) === "/api/me").length === 1
        ? json({ error: { code: "token_expired", message: "expired" } }, 401)
        : json({ data: { user } });
    });
    await expect(apiFetch("/api/me")).resolves.toEqual({ user });
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toEqual(["/api/me", "/api/auth/refresh", "/api/me"]);
    expect(authHeader(fetchMock.mock.calls[2]!)).toBe("Bearer token-2");
    expect(store.getState().auth.accessToken).toBe("token-2");
  });

  it("shares ONE refresh between concurrent requests (single-flight)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 15 * 60 * 1000); // access token already expired client-side
    let refreshes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/auth/refresh") {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return json({ data: { accessToken: "token-2", expiresIn: 900 } });
      }
      return json({ data: { ok: true } });
    });
    await Promise.all([apiFetch("/api/me"), apiFetch("/api/me"), apiFetch("/api/me")]);
    expect(refreshes).toBe(1);
    vi.useRealTimers();
  });

  it("signs the user out when the refresh is rejected", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input) === "/api/auth/refresh"
        ? json({ error: { code: "token_reuse", message: "revoked" } }, 401)
        : json({ error: { code: "token_expired", message: "expired" } }, 401),
    );
    await expect(apiFetch("/api/me")).rejects.toMatchObject({ status: 401 });
    expect(store.getState().auth).toMatchObject({
      status: "anonymous",
      user: null,
      accessToken: null,
    });
  });

  it("does not retry non-auth errors and surfaces structured errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json(
        {
          error: {
            code: "validation_error",
            message: "bad",
            fields: [{ path: "phone", message: "Invalid" }],
          },
        },
        400,
      ),
    );
    const error = await apiFetch("/api/me", { method: "PATCH", json: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_error",
      fields: [{ path: "phone", message: "Invalid" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("postJson", () => {
  it("carries Retry-After for rate limits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ error: { code: "rate_limited", message: "slow down" } }, 429, { "Retry-After": "42" }),
    );
    await expect(postJson("/api/auth/login", {})).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 42,
    });
  });
});

describe("restoreSession", () => {
  it("costs zero requests for anonymous visitors (no hint cookie)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await store.dispatch(restoreSession());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getState().auth.status).toBe("anonymous");
  });

  it("restores the session for returning customers via refresh + profile", async () => {
    document.cookie = "fw_auth=1; path=/";
    store = makeStore();
    bindStore(store);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) =>
        String(input) === "/api/auth/refresh"
          ? json({ data: { accessToken: "fresh", expiresIn: 900 } })
          : json({ data: { user } }),
      );
    await store.dispatch(restoreSession());
    expect(store.getState().auth).toMatchObject({
      status: "authenticated",
      accessToken: "fresh",
      user,
    });
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual(["/api/auth/refresh", "/api/me"]);
  });

  it("falls back to anonymous when the refresh cookie is dead", async () => {
    document.cookie = "fw_auth=1; path=/";
    store = makeStore();
    bindStore(store);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({ error: { code: "invalid_refresh_token", message: "x" } }, 401),
    );
    await store.dispatch(restoreSession());
    expect(store.getState().auth.status).toBe("anonymous");
  });
});
