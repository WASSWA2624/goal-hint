import { configureStore } from "@reduxjs/toolkit";
import { publicRefreshApi } from "./refresh-base.ts";

/** Match pages need the request cache alone; feed drafts and snapshots belong to the feed. */
export function makeDetailStore() {
  return configureStore({ reducer: { [publicRefreshApi.reducerPath]: publicRefreshApi.reducer },
    middleware: (getDefault) => getDefault().concat(publicRefreshApi.middleware) });
}

export type DetailStore = ReturnType<typeof makeDetailStore>;
export type DetailState = ReturnType<DetailStore["getState"]>;
export type DetailDispatch = DetailStore["dispatch"];
