import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AuthUser } from "./types";

export type AuthStatus = "unknown" | "authenticated" | "anonymous";

export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** Memory only. Never persisted (no localStorage/cookie): XSS cannot read it after a reload. */
  accessToken: string | null;
  /** Epoch ms; lets the client refresh just before expiry. */
  expiresAt: number | null;
};

const initialState: AuthState = {
  status: "unknown",
  user: null,
  accessToken: null,
  expiresAt: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionStarted(
      state,
      action: PayloadAction<{ user: AuthUser; accessToken: string; expiresIn: number }>,
    ) {
      state.status = "authenticated";
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.expiresAt = Date.now() + action.payload.expiresIn * 1000;
    },
    tokenRefreshed(state, action: PayloadAction<{ accessToken: string; expiresIn: number }>) {
      state.accessToken = action.payload.accessToken;
      state.expiresAt = Date.now() + action.payload.expiresIn * 1000;
    },
    userLoaded(state, action: PayloadAction<AuthUser>) {
      state.status = "authenticated";
      state.user = action.payload;
    },
    signedOut(state) {
      state.status = "anonymous";
      state.user = null;
      state.accessToken = null;
      state.expiresAt = null;
    },
  },
});

export const { sessionStarted, tokenRefreshed, userLoaded, signedOut } = authSlice.actions;
export default authSlice.reducer;
