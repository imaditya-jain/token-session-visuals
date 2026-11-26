import { createAsyncThunk } from "@reduxjs/toolkit";

import type { ApiFailure } from "@/features/auth/types";
import { ApiError, apiFetch, publicJson } from "@/lib/api-client";
import type { Cart } from "@/lib/cart";
import type { Booking } from "@/lib/gardener-schemas";
import type { GiftOptions } from "@/lib/gift-schemas";

import {
  cartFailed,
  cartLinked,
  cartReceived,
  cartStarted,
  guestIdentified,
  setCartOpen,
} from "./cartSlice";

type CartResponse = { cart: Cart | null; linkedUserId?: string };

const failure = (error: unknown): ApiFailure =>
  error instanceof ApiError
    ? error.toJSON()
    : {
        status: 0,
        code: "network_error",
        message: "Network problem. Check your connection and try again.",
      };

/** Runs a cart request, mirrors the outcome into the store, and reports success to the caller. */
const cartThunk = <Arg>(
  type: string,
  request: (arg: Arg) => Promise<CartResponse>,
  /** True when the request hands the cart a buyer email the visitor chose (a booking). Set before the cart lands so the identity sync can't undo it. */
  givesBuyerEmail: (arg: Arg) => boolean = () => false,
) =>
  createAsyncThunk<boolean, Arg, { rejectValue: ApiFailure }>(type, async (arg, { dispatch }) => {
    dispatch(cartStarted());
    try {
      const result = await request(arg);
      if (givesBuyerEmail(arg)) dispatch(guestIdentified());
      dispatch(cartReceived(result.cart));
      if (result.cart && result.linkedUserId) dispatch(cartLinked(result.linkedUserId));
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
  async ({
    variantId,
    quantity = 1,
    sellingPlanId,
    booking,
    gift,
  }: {
    variantId: string;
    quantity?: number;
    sellingPlanId?: string;
    booking?: Booking;
    gift?: GiftOptions;
  }) =>
    publicJson<CartResponse>("/api/cart/lines", "POST", {
      variantId,
      quantity,
      ...(sellingPlanId ? { sellingPlanId } : {}),
      ...(booking ? { booking } : {}),
      ...(gift ? { gift } : {}),
    }),
  ({ booking }) => Boolean(booking),
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

/** Links the cart to the signed-in account so checkout is pre-filled and the order lands in their history. */
export const linkCartIdentity = cartThunk("cart/link", async (userId: string) => {
  const result = await apiFetch<CartResponse>("/api/cart/identity", { method: "PUT" });
  return { ...result, linkedUserId: userId };
});

/** Removes the account email from the cart after sign-out. */
export const unlinkCartIdentity = cartThunk<void>("cart/unlink", async () =>
  publicJson<CartResponse>("/api/cart/identity", "DELETE"),
);
