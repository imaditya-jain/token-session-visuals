"use client";

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

  useEffect(() => {
    void store.dispatch(restoreSession());
    void store.dispatch(loadCart());
  }, [store]);

  return (
    <Provider store={store}>
      <SmoothScroll />
      <CartIdentitySync />
      {children}
    </Provider>
  );
}
