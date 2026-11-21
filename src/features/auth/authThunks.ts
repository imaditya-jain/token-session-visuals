import { createAsyncThunk } from "@reduxjs/toolkit";

import type { LoginInput, ProfileInput, RegisterInput } from "@/lib/auth-schemas";
import { ApiError, apiFetch, postJson, refreshAccessToken } from "@/lib/api-client";
import type { ForgotPasswordInput, ResetPasswordInput } from "@/lib/auth-schemas";

import { sessionStarted, signedOut, userLoaded } from "./authSlice";
import type { ApiFailure, AuthUser } from "./types";

type Session = { user: AuthUser; accessToken: string; expiresIn: number };

const failure = (error: unknown): ApiFailure =>
  error instanceof ApiError
    ? error.toJSON()
    : {
        status: 0,
        code: "network_error",
        message: "Network problem. Check your connection and try again.",
      };

const thunk = <Arg, Result>(
  type: string,
  run: (arg: Arg, dispatch: (a: unknown) => unknown) => Promise<Result>,
) =>
  createAsyncThunk<Result, Arg, { rejectValue: ApiFailure }>(
    type,
    async (arg, { dispatch, rejectWithValue }) => {
      try {
        return await run(arg, dispatch as (a: unknown) => unknown);
      } catch (error) {
        return rejectWithValue(failure(error));
      }
    },
  );

export const login = thunk<LoginInput, AuthUser>("auth/login", async (input, dispatch) => {
  const session = await postJson<Session>("/api/auth/login", input);
  dispatch(sessionStarted(session));
  return session.user;
});

export const register = thunk<RegisterInput, AuthUser>("auth/register", async (input, dispatch) => {
  const session = await postJson<Session>("/api/auth/register", input);
  dispatch(sessionStarted(session));
  return session.user;
});

export const logout = thunk<void, void>("auth/logout", async (_arg, dispatch) => {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    dispatch(signedOut());
  }
});

export const logoutAll = thunk<void, void>("auth/logoutAll", async (_arg, dispatch) => {
  await apiFetch<void>("/api/auth/logout-all", { method: "POST" });
  dispatch(signedOut());
});

/** Downloads everything we hold about the signed-in person as a JSON file. */
export const exportMyData = thunk<void, void>("auth/exportData", async () => {
  const data = await apiFetch<unknown>("/api/me/export");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "fernwood-my-data.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

/** Permanently deletes the account (the server re-checks the password), then ends the local session. */
export const deleteMyAccount = thunk<string, void>(
  "auth/deleteAccount",
  async (password, dispatch) => {
    await apiFetch<void>("/api/me", { method: "DELETE", json: { password } });
    dispatch(signedOut());
  },
);

export const updateProfile = thunk<ProfileInput, AuthUser>(
  "auth/updateProfile",
  async (patch, dispatch) => {
    const { user } = await apiFetch<{ user: AuthUser }>("/api/me", {
      method: "PATCH",
      json: patch,
    });
    dispatch(userLoaded(user));
    return user;
  },
);

const hasAuthHint = () => document.cookie.split("; ").includes("fw_auth=1");

/**
 * Restores the session after a reload. Anonymous visitors (no `fw_auth` hint cookie) cost zero requests;
 * returning customers make one refresh and one profile call.
 */
export const restoreSession = createAsyncThunk<void, void>(
  "auth/restore",
  async (_arg, { dispatch }) => {
    if (!hasAuthHint()) {
      dispatch(signedOut());
      return;
    }
    if (!(await refreshAccessToken())) return;
    try {
      const { user } = await apiFetch<{ user: AuthUser }>("/api/me");
      dispatch(userLoaded(user));
    } catch {
      dispatch(signedOut());
    }
  },
);

export const forgotPassword = thunk<ForgotPasswordInput, void>(
  "auth/forgotPassword",
  async (input) => {
    await postJson("/api/auth/forgot-password", input);
  },
);

export const resetPassword = thunk<ResetPasswordInput, void>(
  "auth/resetPassword",
  async (input, dispatch) => {
    await postJson("/api/auth/reset-password", input);
    // The server revoked every session; make the UI agree.
    dispatch(signedOut());
  },
);

export const confirmEmail = thunk<string, void>("auth/confirmEmail", async (token, dispatch) => {
  await postJson("/api/auth/verify-email/confirm", { token });
  if (document.cookie.split("; ").includes("fw_auth=1")) {
    // A signed-in customer just verified: refresh the flag shown in the account page.
    try {
      const { user } = await apiFetch<{ user: AuthUser }>("/api/me");
      dispatch(userLoaded(user));
    } catch {
      /* the next page load restores it */
    }
  }
});

export const resendVerification = thunk<void, void>("auth/resendVerification", async () => {
  await apiFetch<void>("/api/auth/verify-email/request", { method: "POST" });
});
