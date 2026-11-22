import { createAsyncThunk } from "@reduxjs/toolkit";

import { sessionStarted, signedOut } from "@/features/auth/authSlice";
import type { ApiFailure, AuthUser } from "@/features/auth/types";
import { ApiError, apiFetch, postJson } from "@/lib/api-client";
import type { LoginInput, OtpChallenge } from "@/lib/auth-schemas";

import {
  accessCleared,
  accessDenied,
  accessFailed,
  accessLoaded,
  accessLoading,
  type AdminAccess,
} from "./adminSlice";

type Session = { user: AuthUser; accessToken: string; expiresIn: number };

const failure = (error: unknown): ApiFailure =>
  error instanceof ApiError
    ? error.toJSON()
    : {
        status: 0,
        code: "network_error",
        message: "Network problem. Check your connection and try again.",
      };

/** Finds out whether the current session belongs to an admin, and what that admin may do. */
export const loadAdminAccess = createAsyncThunk<void, void>(
  "admin/loadAccess",
  async (_arg, { dispatch }) => {
    dispatch(accessLoading());
    try {
      const data = await apiFetch<{ roleKey: string; permissions: AdminAccess["permissions"] }>(
        "/api/admin/me",
      );
      dispatch(accessLoaded({ roleKey: data.roleKey, permissions: data.permissions }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "admin_required") dispatch(accessDenied());
      else if (error instanceof ApiError && error.status === 401) dispatch(signedOut());
      else dispatch(accessFailed());
    }
  },
);

/** Step 1: email + password. The server emails a code; no session exists yet. */
export const requestAdminCode = createAsyncThunk<
  OtpChallenge,
  LoginInput,
  { rejectValue: ApiFailure }
>("admin/requestCode", async (input, { rejectWithValue }) => {
  try {
    return await postJson<OtpChallenge>("/api/admin/auth/login", input);
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export const resendAdminCode = createAsyncThunk<OtpChallenge, string, { rejectValue: ApiFailure }>(
  "admin/resendCode",
  async (challenge, { rejectWithValue }) => {
    try {
      return await postJson<OtpChallenge>("/api/admin/auth/resend", { challenge });
    } catch (error) {
      return rejectWithValue(failure(error));
    }
  },
);

/** Step 2: the code opens the session; the admin's permissions are loaded straight after. */
export const verifyAdminCode = createAsyncThunk<
  void,
  { challenge: string; code: string },
  { rejectValue: ApiFailure }
>("admin/verifyCode", async (input, { dispatch, rejectWithValue }) => {
  try {
    const session = await postJson<Session>("/api/admin/auth/verify", input);
    dispatch(sessionStarted(session));
    await dispatch(loadAdminAccess());
    return undefined;
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export const clearAdminAccess = () => accessCleared();
