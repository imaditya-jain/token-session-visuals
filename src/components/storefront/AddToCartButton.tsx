"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { addToCart } from "@/features/cart/cartThunks";
import { setCartOpen } from "@/features/cart/cartSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type Props = { name: string; variantId: string | undefined };

/** Quick-add button of the product card. Markup and classes are the locked design; only behavior is added. */
export default function AddToCartButton({ name, variantId }: Props) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((state) => state.cart.busy);
  const [state, setState] = useState<"idle" | "adding" | "failed">("idle");

  const add = async () => {
    // The offline fallback catalog has no Shopify variants, so nothing can be purchased from it.
    if (!variantId || busy) {
      if (!variantId) setState("failed");
      return;
    }
    setState("adding");
    const added = await dispatch(addToCart({ variantId })).unwrap();
    setState(added ? "idle" : "failed");
    if (added) dispatch(setCartOpen(true));
  };

  // The accessible name must contain the visible words (WCAG 2.5.3), so voice-control users can say what they see.
  const label =
    state === "adding"
      ? `Adding… ${name}`
      : state === "failed"
        ? `Try again: add ${name} to cart`
        : `Add to cart: ${name}`;

  return (
    <button
      type="button"
      onClick={() => void add()}
      aria-label={label}
      aria-busy={state === "adding"}
      className="absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-center gap-2 rounded-md bg-forest-deep/90 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream opacity-95 backdrop-blur-sm transition-all duration-300 hover:bg-forest-deep group-hover:translate-y-0 sm:opacity-0 sm:group-hover:opacity-100"
    >
      <ShoppingBag className="size-4" aria-hidden />
      {state === "adding" ? "Adding…" : state === "failed" ? "Try again" : "Add to cart"}
    </button>
  );
}
