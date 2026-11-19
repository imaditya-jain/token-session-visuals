import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Cart } from "@/lib/cart";

import type { ApiFailure } from "@/features/auth/types";

export type CartState = {
  cart: Cart | null;
  /** The mini-cart panel. */
  open: boolean;
  /** True while a request is in flight (disables repeated clicks). */
  busy: boolean;
  error: string | null;
};

const initialState: CartState = { cart: null, open: false, busy: false, error: null };

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    setCartOpen(state, action: PayloadAction<boolean>) {
      state.open = action.payload;
    },
    cartStarted(state) {
      state.busy = true;
      state.error = null;
    },
    cartReceived(state, action: PayloadAction<Cart | null>) {
      state.cart = action.payload;
      state.busy = false;
    },
    cartFailed(state, action: PayloadAction<ApiFailure>) {
      state.busy = false;
      state.error = action.payload.message;
    },
  },
});

export const { setCartOpen, cartStarted, cartReceived, cartFailed } = cartSlice.actions;
export default cartSlice.reducer;
