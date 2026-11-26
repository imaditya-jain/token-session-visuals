"use client";

import { useEffect } from "react";

import { wishlistCleared } from "@/features/wishlist/wishlistSlice";
import { loadWishlist } from "@/features/wishlist/wishlistThunks";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

/** Loads the saved handles once per signed-in account and clears them on sign-out. Renders nothing. */
export default function WishlistSync() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const loadedFor = useAppSelector((state) => state.wishlist.loadedFor);

  useEffect(() => {
    if (status === "authenticated" && userId && loadedFor !== userId) {
      void dispatch(loadWishlist(userId));
    } else if (status === "anonymous" && loadedFor !== null) {
      dispatch(wishlistCleared());
    }
  }, [status, userId, loadedFor, dispatch]);

  return null;
}
