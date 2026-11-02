import { ShoppingBag } from "lucide-react";

import { formatPrice, type Product } from "@/data/catalog";

export default function ProductCard({ product }: { product: Product }) {
  const onSale = product.compareAtPrice !== undefined;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative overflow-hidden bg-sand">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={800}
          height={1000}
          className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {product.badge && (
          <span
            className={`absolute left-3 top-3 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-cream ${
              product.badge === "Sale"
                ? "bg-clay"
                : product.badge === "New"
                  ? "bg-forest"
                  : "bg-forest-deep/85"
            }`}
          >
            {product.badge}
          </span>
        )}

        {/* Quick add on hover / always visible on touch */}
        <button
          aria-label={`Add ${product.name} to cart`}
          className="absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-center gap-2 rounded-md bg-forest-deep/90 py-2.5 text-xs font-semibold uppercase tracking-wider text-cream opacity-95 backdrop-blur-sm transition-all duration-300 hover:bg-forest-deep group-hover:translate-y-0 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ShoppingBag className="size-4" aria-hidden />
          Add to cart
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {product.category}
        </p>
        <h3 className="font-display text-lg font-medium leading-snug text-foreground">
          {product.name}
        </h3>
        <p className="text-xs text-muted-foreground">{product.light}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-semibold text-forest">
            {formatPrice(product.price)}
          </span>
          {onSale && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice!)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
