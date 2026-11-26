import { createAsyncThunk } from "@reduxjs/toolkit";

import { apiFetch } from "@/lib/api-client";
import type { RootState } from "@/store";

import { wishlistChanged, wishlistLoaded } from "./wishlistSlice";

type HandlesResponse = { handles: string[] };

export const loadWishlist = createAsyncThunk(
  "wishlist/load",
  async (userId: string, { dispatch }) => {
    try {
      const { handles } = await apiFetch<HandlesResponse>("/api/wishlist");
      dispatch(wishlistLoaded({ userId, handles }));
    } catch {
      // The hearts simply stay empty; saving still works and reports its own errors.
      dispatch(wishlistLoaded({ userId, handles: [] }));
    }
  },
);

/** Saves or removes a product. The heart changes at once and is put back if the server refuses. */
export const toggleWishlist = createAsyncThunk<boolean, string, { state: RootState }>(
  "wishlist/toggle",
  async (handle, { dispatch, getState }) => {
    const before = getState().wishlist.handles;
    const saved = before.includes(handle);
    dispatch(wishlistChanged(saved ? before.filter((h) => h !== handle) : [handle, ...before]));
    try {
      const { handles } = await apiFetch<HandlesResponse>("/api/wishlist/items", {
        method: saved ? "DELETE" : "POST",
        json: { handle },
      });
      dispatch(wishlistChanged(handles));
      return true;
    } catch {
      dispatch(wishlistChanged(before));
      return false;
    }
  },
);
