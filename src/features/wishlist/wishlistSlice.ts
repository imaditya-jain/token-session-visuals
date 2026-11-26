import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type WishlistState = {
  /** Saved product handles, newest first. */
  handles: string[];
  /** The account the handles belong to; null while signed out. */
  loadedFor: string | null;
};

const initialState: WishlistState = { handles: [], loadedFor: null };

const slice = createSlice({
  name: "wishlist",
  initialState,
  reducers: {
    wishlistLoaded(state, action: PayloadAction<{ userId: string; handles: string[] }>) {
      state.handles = action.payload.handles;
      state.loadedFor = action.payload.userId;
    },
    wishlistChanged(state, action: PayloadAction<string[]>) {
      state.handles = action.payload;
    },
    wishlistCleared() {
      return initialState;
    },
  },
});

export const { wishlistLoaded, wishlistChanged, wishlistCleared } = slice.actions;
export default slice.reducer;
