import { configureStore } from "@reduxjs/toolkit";

import admin from "@/features/admin/adminSlice";
import auth from "@/features/auth/authSlice";
import cart from "@/features/cart/cartSlice";
import ui from "@/features/ui/uiSlice";

export const makeStore = () => configureStore({ reducer: { ui, auth, cart, admin } });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
