import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ apiFetch: vi.fn(), publicJson: vi.fn() }));
vi.mock("@/lib/api-client", async (original) => ({
  ...(await original<typeof import("@/lib/api-client")>()),
  apiFetch: api.apiFetch,
  publicJson: api.publicJson,
}));

import { sessionStarted, signedOut } from "@/features/auth/authSlice";
import { cartReceived } from "@/features/cart/cartSlice";
import type { Cart } from "@/lib/cart";
import { makeStore } from "@/store";

import CartIdentitySync from "./CartIdentitySync";

const cart = (identified: boolean, url = "https://shop.example/c/1"): Cart => ({
  lines: [],
  totalQuantity: 1,
  subtotal: { amount: "10.0", currency: "USD" },
  checkoutUrl: url,
  identified,
});
const user = {
  id: "u1",
  email: "a@example.com",
  firstName: "A",
  lastName: "B",
  role: "customer" as const,
  acceptsMarketing: false,
  emailVerified: true,
};
const signIn = (store: ReturnType<typeof makeStore>) =>
  store.dispatch(sessionStarted({ user, accessToken: "t", expiresIn: 900 }));

function setup() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <CartIdentitySync />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  api.apiFetch.mockReset().mockResolvedValue({ cart: cart(true, "https://shop.example/c/linked") });
  api.publicJson
    .mockReset()
    .mockResolvedValue({ cart: cart(false, "https://shop.example/c/plain") });
});

describe("CartIdentitySync", () => {
  it("links a signed-in customer's cart once", async () => {
    const store = setup();
    act(() => {
      signIn(store);
      store.dispatch(cartReceived(cart(false)));
    });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(1));
    expect(api.apiFetch).toHaveBeenCalledWith("/api/cart/identity", { method: "PUT" });
    await waitFor(() => expect(store.getState().cart.linkedUserId).toBe("u1"));
    expect(store.getState().cart.cart?.identified).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
  });

  it("links when the cart arrives after the session", async () => {
    const store = setup();
    act(() => void signIn(store));
    expect(api.apiFetch).not.toHaveBeenCalled();
    act(() => void store.dispatch(cartReceived(cart(false))));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(1));
  });

  it("does nothing without a cart or while the session is unknown", async () => {
    const store = setup();
    act(() => void signIn(store));
    await new Promise((resolve) => setTimeout(resolve, 30));
    act(() => void store.dispatch(cartReceived(cart(false))));
    expect(api.publicJson).not.toHaveBeenCalled();
  });

  it("unlinks an identified cart once the visitor is anonymous", async () => {
    const store = setup();
    act(() => {
      store.dispatch(signedOut());
      store.dispatch(cartReceived(cart(true)));
    });
    await waitFor(() => expect(api.publicJson).toHaveBeenCalledTimes(1));
    expect(api.publicJson).toHaveBeenCalledWith("/api/cart/identity", "DELETE");
    await waitFor(() => expect(store.getState().cart.cart?.identified).toBe(false));
  });

  it("does not touch an anonymous visitor's plain cart", async () => {
    const store = setup();
    act(() => {
      store.dispatch(signedOut());
      store.dispatch(cartReceived(cart(false)));
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.publicJson).not.toHaveBeenCalled();
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it("unlinks after sign-out", async () => {
    const store = setup();
    act(() => {
      signIn(store);
      store.dispatch(cartReceived(cart(false)));
    });
    await waitFor(() => expect(store.getState().cart.linkedUserId).toBe("u1"));
    act(() => void store.dispatch(signedOut()));
    expect(store.getState().cart.linkedUserId).toBeNull();
    await waitFor(() => expect(api.publicJson).toHaveBeenCalledTimes(1));
  });

  it("does not retry in a loop when linking fails", async () => {
    api.apiFetch.mockRejectedValue(new Error("offline"));
    const store = setup();
    act(() => {
      signIn(store);
      store.dispatch(cartReceived(cart(false)));
    });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
    expect(store.getState().cart.error).toBeTruthy();
  });
});
