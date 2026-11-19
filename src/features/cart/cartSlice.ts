import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { Cart } from "@/lib/cart";

import { signedOut } from "@/features/auth/authSlice";
import type { ApiFailure } from "@/features/auth/types";

export type CartState = {
  cart: Cart | null;
  /** The mini-cart panel. */
  open: boolean;
  /** True while a request is in flight (disables repeated clicks). */
  busy: boolean;
  error: string | null;
  /** Account the cart was linked to in this page session (checkout is pre-filled with that email). */
  linkedUserId: string | null;
};

const initialState: CartState = {
  cart: null,
  open: false,
  busy: false,
  error: null,
  linkedUserId: null,
};

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
      if (!action.payload) state.linkedUserId = null;
    },
    cartLinked(state, action: PayloadAction<string | null>) {
      state.linkedUserId = action.payload;
    },
    cartFailed(state, action: PayloadAction<ApiFailure>) {
      state.busy = false;
      state.error = action.payload.message;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, (state) => {
      state.linkedUserId = null;
    });
  },
});

export const { setCartOpen, cartStarted, cartReceived, cartFailed, cartLinked } = cartSlice.actions;
export default cartSlice.reducer;
