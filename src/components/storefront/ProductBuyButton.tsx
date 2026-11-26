"use client";

import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { setCartOpen } from "@/features/cart/cartSlice";
import { addToCart } from "@/features/cart/cartThunks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

/** Main add-to-cart action of the product page. */
export default function ProductBuyButton({
  name,
  variantId,
  inStock,
}: {
  name: string;
  variantId: string | undefined;
  inStock: boolean;
}) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((state) => state.cart.busy);
  const [state, setState] = useState<"idle" | "adding" | "failed">("idle");

  if (!inStock) {
    return (
      <p className="flex h-14 w-full items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Sold out
      </p>
    );
  }

  const add = async () => {
    if (!variantId || busy) {
      if (!variantId) setState("failed");
      return;
    }
    setState("adding");
    const added = await dispatch(addToCart({ variantId })).unwrap();
    setState(added ? "idle" : "failed");
    if (added) dispatch(setCartOpen(true));
  };

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
      className="group flex h-14 w-full items-center justify-center gap-3 rounded-full bg-forest px-8 text-sm font-semibold uppercase tracking-wider text-cream shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-forest-deep hover:shadow-xl active:translate-y-0 disabled:opacity-70"
    >
      <ShoppingBag className="size-5 transition-transform group-hover:-rotate-6" aria-hidden />
      {state === "adding" ? "Adding…" : state === "failed" ? "Try again" : "Add to cart"}
    </button>
  );
}
