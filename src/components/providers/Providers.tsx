"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";

import CartIdentitySync from "@/components/providers/CartIdentitySync";
import SmoothScroll from "@/components/providers/SmoothScroll";
import { restoreSession } from "@/features/auth/authThunks";
import { loadCart } from "@/features/cart/cartThunks";
import { bindStore } from "@/lib/api-client";
import { makeStore, type AppStore } from "@/store";

export default function Providers({ children }: { children: ReactNode }) {
  const [store] = useState<AppStore>(() => {
    const created = makeStore();
    bindStore(created);
    return created;
  });

  // The admin is not a storefront: it has no cart, and no smooth-scroll or cart-link behaviour.
  const inAdmin = usePathname().startsWith("/admin");

  useEffect(() => {
    void store.dispatch(restoreSession());
    if (!inAdmin) void store.dispatch(loadCart());
  }, [store, inAdmin]);

  return (
    <Provider store={store}>
      {inAdmin ? null : <SmoothScroll />}
      {inAdmin ? null : <CartIdentitySync />}
      {children}
    </Provider>
  );
}
