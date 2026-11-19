"use client";

import { Minus, Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { setCartOpen } from "@/features/cart/cartSlice";
import { removeCartLine, updateCartLine } from "@/features/cart/cartThunks";
import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const money = (amount: string, currency: string) => formatMoney({ amount, currency });

/** Slide-out cart, composed from the existing Sheet and brand tokens (same look as the mobile menu). */
export default function MiniCart() {
  const dispatch = useAppDispatch();
  const { cart, open, busy, error } = useAppSelector((state) => state.cart);
  const lines = cart?.lines ?? [];
  const close = () => dispatch(setCartOpen(false));

  return (
    <Sheet open={open} onOpenChange={(next) => dispatch(setCartOpen(next))}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col border-border bg-forest p-0 text-cream sm:w-96"
      >
        <SheetHeader className="border-b border-cream/15 px-6 py-5">
          <SheetTitle className="font-display text-2xl text-cream">Your cart</SheetTitle>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="font-display text-xl text-cream">Your cart is empty</p>
            <Link
              href="/shop"
              onClick={close}
              className="rounded-md bg-cream px-6 py-3 text-sm font-semibold text-forest-deep transition-colors hover:bg-sage-light"
            >
              Shop all plants
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-cream/10 overflow-y-auto px-6">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-4 py-5">
                  <Link href={`/products/${line.slug}`} onClick={close} className="shrink-0">
                    {line.image ? (
                      <Image
                        src={line.image}
                        alt={line.name}
                        width={160}
                        height={200}
                        sizes="80px"
                        className="aspect-[4/5] w-20 rounded-md object-cover"
                      />
                    ) : null}
                  </Link>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/products/${line.slug}`}
                          onClick={close}
                          className="font-display text-lg leading-snug text-cream transition-colors hover:text-sage"
                        >
                          {line.name}
                        </Link>
                        {line.variantTitle ? (
                          <p className="text-xs text-sage">{line.variantTitle}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void dispatch(removeCartLine({ lineId: line.id }))}
                        aria-label={`Remove ${line.name}`}
                        className="-mr-2 -mt-1 flex size-11 items-center justify-center rounded-full text-sage transition-colors hover:bg-cream/10 hover:text-cream disabled:opacity-50"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-cream/25">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void dispatch(
                              updateCartLine({ lineId: line.id, quantity: line.quantity - 1 }),
                            )
                          }
                          aria-label={`Decrease quantity of ${line.name}`}
                          className="flex size-11 items-center justify-center transition-colors hover:bg-cream/10 disabled:opacity-50"
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span
                          className="min-w-6 text-center text-sm font-semibold"
                          aria-label={`Quantity ${line.quantity}`}
                        >
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={busy || line.quantity >= MAX_LINE_QUANTITY}
                          onClick={() =>
                            void dispatch(
                              updateCartLine({ lineId: line.id, quantity: line.quantity + 1 }),
                            )
                          }
                          aria-label={`Increase quantity of ${line.name}`}
                          className="flex size-11 items-center justify-center transition-colors hover:bg-cream/10 disabled:opacity-50"
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">
                        {money(line.lineTotal, cart!.subtotal.currency)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-cream/15 px-6 py-6">
              {error ? (
                <p role="alert" className="mb-4 text-sm text-sage-light">
                  {error}
                </p>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-sage">Subtotal</span>
                <span className="font-display text-xl">
                  {money(cart!.subtotal.amount, cart!.subtotal.currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-sage">
                Shipping and taxes are calculated at checkout.
              </p>
              <a
                href={cart!.checkoutUrl}
                className="mt-5 flex w-full items-center justify-center rounded-md bg-cream py-3.5 text-sm font-semibold text-forest-deep transition-colors hover:bg-sage-light"
              >
                Checkout
              </a>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
