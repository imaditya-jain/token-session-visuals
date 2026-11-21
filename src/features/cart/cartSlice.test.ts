import { describe, expect, it } from "vitest";

import { signedOut } from "@/features/auth/authSlice";
import type { Cart } from "@/lib/cart";

import reducer, { cartReceived, guestIdentified } from "./cartSlice";

const cart: Cart = {
  lines: [],
  totalQuantity: 0,
  subtotal: { amount: "0.0", currency: "USD" },
  checkoutUrl: "https://shop.example/c/1",
  identified: true,
};

describe("guest identity (booking)", () => {
  it("is remembered for the session and cleared by sign-out or an emptied cart", () => {
    let state = reducer(undefined, cartReceived(cart));
    state = reducer(state, guestIdentified());
    expect(state.guestIdentified).toBe(true);
    expect(reducer(state, signedOut()).guestIdentified).toBe(false);
    expect(reducer(state, cartReceived(null)).guestIdentified).toBe(false);
  });
});
