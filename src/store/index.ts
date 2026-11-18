import { configureStore } from "@reduxjs/toolkit";

import auth from "@/features/auth/authSlice";
import ui from "@/features/ui/uiSlice";

export const makeStore = () => configureStore({ reducer: { ui, auth } });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
