"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";

import SmoothScroll from "@/components/providers/SmoothScroll";
import { restoreSession } from "@/features/auth/authThunks";
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
  }, [store]);

  return (
    <Provider store={store}>
      <SmoothScroll />
      {children}
    </Provider>
  );
}
