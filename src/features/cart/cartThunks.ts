import { createAsyncThunk } from "@reduxjs/toolkit";

import type { ApiFailure } from "@/features/auth/types";
import { ApiError, publicJson } from "@/lib/api-client";
import type { Cart } from "@/lib/cart";

import { cartFailed, cartReceived, cartStarted, setCartOpen } from "./cartSlice";

type CartResponse = { cart: Cart | null };

const failure = (error: unknown): ApiFailure =>
  error instanceof ApiError
    ? error.toJSON()
    : {
        status: 0,
        code: "network_error",
        message: "Network problem. Check your connection and try again.",
      };

/** Runs a cart request, mirrors the outcome into the store, and reports success to the caller. */
const cartThunk = <Arg>(type: string, request: (arg: Arg) => Promise<CartResponse>) =>
  createAsyncThunk<boolean, Arg, { rejectValue: ApiFailure }>(type, async (arg, { dispatch }) => {
    dispatch(cartStarted());
    try {
      dispatch(cartReceived((await request(arg)).cart));
      return true;
    } catch (error) {
      dispatch(cartFailed(failure(error)));
      return false;
    }
  });

const HINT_COOKIE = "fw_cart_hint";
const hasCartHint = () => document.cookie.split("; ").some((c) => c.startsWith(`${HINT_COOKIE}=`));

/** Loads the cart once on startup, but only for visitors who actually have one. */
export const loadCart = createAsyncThunk("cart/load", async (_: void, { dispatch }) => {
  if (!hasCartHint()) return;
  try {
    dispatch(cartReceived((await publicJson<CartResponse>("/api/cart", "GET")).cart));
  } catch (error) {
    dispatch(cartFailed(failure(error)));
  }
});

export const addToCart = cartThunk(
  "cart/add",
  async ({ variantId, quantity = 1 }: { variantId: string; quantity?: number }) =>
    publicJson<CartResponse>("/api/cart/lines", "POST", { variantId, quantity }),
);

export const updateCartLine = cartThunk(
  "cart/update",
  async (input: { lineId: string; quantity: number }) =>
    publicJson<CartResponse>("/api/cart/lines", "PATCH", input),
);

export const removeCartLine = cartThunk("cart/remove", async (input: { lineId: string }) =>
  publicJson<CartResponse>("/api/cart/lines", "DELETE", input),
);

export const openCart = () => setCartOpen(true);
