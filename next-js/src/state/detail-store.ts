import { configureStore } from "@reduxjs/toolkit";
import { publicRefreshApi } from "./refresh-base.ts";

/** Match pages need the request cache alone; feed drafts and snapshots belong to the feed. */
export function makeDetailStore() {
  // Responses are validated before entering the cache. Avoid walking the same
  // bookmaker and insight projections on every subscription and polling action.
  const checks = { ignoredPaths: [`${publicRefreshApi.reducerPath}.queries`] };
  return configureStore({ reducer: { [publicRefreshApi.reducerPath]: publicRefreshApi.reducer },
    middleware: (getDefault) => getDefault({ immutableCheck: checks, serializableCheck: checks }).concat(publicRefreshApi.middleware) });
}

export type DetailStore = ReturnType<typeof makeDetailStore>;
export type DetailState = ReturnType<DetailStore["getState"]>;
export type DetailDispatch = DetailStore["dispatch"];
