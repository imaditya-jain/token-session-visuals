"use client";

import { useEffect, useRef } from "react";

import { linkCartIdentity, unlinkCartIdentity } from "@/features/cart/cartThunks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

/**
 * Keeps the Shopify cart's buyer email in step with who is signed in: link it for a signed-in customer (so
 * checkout is pre-filled and the order shows up in their history), unlink it after sign-out. Renders nothing.
 */
export default function CartIdentitySync() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const cart = useAppSelector((state) => state.cart.cart);
  const linkedUserId = useAppSelector((state) => state.cart.linkedUserId);
  const busy = useAppSelector((state) => state.cart.busy);
  // One attempt per cart + account, so a failing request can't turn into a retry loop.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!cart || busy) return;
    const key = `${status}:${userId ?? ""}:${cart.checkoutUrl}`;
    if (attempted.current === key) return;

    if (status === "authenticated" && userId && (linkedUserId !== userId || !cart.identified)) {
      attempted.current = key;
      void dispatch(linkCartIdentity(userId));
    } else if (status === "anonymous" && cart.identified) {
      attempted.current = key;
      void dispatch(unlinkCartIdentity());
    }
  }, [status, userId, cart, linkedUserId, busy, dispatch]);

  return null;
}
