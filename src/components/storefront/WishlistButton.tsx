"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { toggleWishlist } from "@/features/wishlist/wishlistThunks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

/**
 * Heart that saves a product to the signed-in customer's wishlist. A visitor who is not signed in is taken to
 * sign in first and brought back to this page.
 */
export default function WishlistButton({
  handle,
  name,
  className = "",
}: {
  handle: string;
  name: string;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const status = useAppSelector((state) => state.auth.status);
  const saved = useAppSelector((state) => state.wishlist.handles.includes(handle));

  const onClick = () => {
    if (status === "anonymous") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (status === "authenticated") void dispatch(toggleWishlist(handle));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      className={`flex size-10 items-center justify-center rounded-full bg-cream/95 text-forest shadow-md backdrop-blur transition-all duration-300 hover:scale-110 hover:bg-cream ${className}`}
    >
      <Heart
        className={`size-5 transition-colors ${saved ? "fill-clay text-clay" : ""}`}
        aria-hidden
      />
    </button>
  );
}
