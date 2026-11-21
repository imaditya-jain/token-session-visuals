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
  /** The visitor gave their email for a booking in this page session, so the cart's buyer email is theirs to keep. */
  guestIdentified: boolean;
};

const initialState: CartState = {
  cart: null,
  open: false,
  busy: false,
  error: null,
  linkedUserId: null,
  guestIdentified: false,
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
      if (!action.payload) {
        state.linkedUserId = null;
        state.guestIdentified = false;
      }
    },
    cartLinked(state, action: PayloadAction<string | null>) {
      state.linkedUserId = action.payload;
    },
    guestIdentified(state) {
      state.guestIdentified = true;
    },
    cartFailed(state, action: PayloadAction<ApiFailure>) {
      state.busy = false;
      state.error = action.payload.message;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, (state) => {
      state.linkedUserId = null;
      state.guestIdentified = false;
    });
  },
});

export const { setCartOpen, cartStarted, cartReceived, cartFailed, cartLinked, guestIdentified } =
  cartSlice.actions;
export default cartSlice.reducer;
