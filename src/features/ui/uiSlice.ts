import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UiState = { searchOpen: boolean };

const initialState: UiState = { searchOpen: false };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setSearchOpen(state, action: PayloadAction<boolean>) {
      state.searchOpen = action.payload;
    },
  },
});

export const { setSearchOpen } = uiSlice.actions;
export default uiSlice.reducer;
