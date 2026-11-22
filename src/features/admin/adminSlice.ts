import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Permission } from "@/lib/permissions";

/** What the signed-in person may do in the admin. Used to shape the UI; the API enforces it independently. */
export type AdminAccess = { roleKey: string; permissions: Permission[] };

export type AdminState = {
  /** idle: not asked yet · loading · ready · denied: signed in but not an admin · error: couldn't find out. */
  status: "idle" | "loading" | "ready" | "denied" | "error";
  access: AdminAccess | null;
};

const initialState: AdminState = { status: "idle", access: null };

const adminSlice = createSlice({
  name: "admin",
  initialState,
  reducers: {
    accessLoading(state) {
      state.status = "loading";
    },
    accessLoaded(state, action: PayloadAction<AdminAccess>) {
      state.status = "ready";
      state.access = action.payload;
    },
    accessDenied(state) {
      state.status = "denied";
      state.access = null;
    },
    accessFailed(state) {
      state.status = "error";
    },
    accessCleared() {
      return initialState;
    },
  },
});

export const { accessLoading, accessLoaded, accessDenied, accessFailed, accessCleared } =
  adminSlice.actions;
export default adminSlice.reducer;
