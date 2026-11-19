"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { z } from "zod";

import SmoothScroll from "@/components/providers/SmoothScroll";
import { restoreSession } from "@/features/auth/authThunks";
import { loadCart } from "@/features/cart/cartThunks";
import { bindStore } from "@/lib/api-client";
import { makeStore, type AppStore } from "@/store";

/**
 * zod's JIT fast path probes `new Function("")`; under our Content-Security-Policy the probe is blocked (and
 * reported) before zod falls back. Turning JIT off in the browser avoids the violation. The server keeps JIT.
 */
if (typeof window !== "undefined") z.config({ jitless: true });

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
      {children}
    </Provider>
  );
}
