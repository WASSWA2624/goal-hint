import { configureStore } from "@reduxjs/toolkit";
import type { FeedBootstrap } from "./contracts.ts";
import { createFeedReducer, requestStarted } from "./feed.ts";
import { preferencesSlice } from "./preferences.ts";

/** This factory is the only store constructor; no module owns a store instance. */
export function makeStore(bootstrap: FeedBootstrap) {
  return configureStore({ reducer: { feed: createFeedReducer(bootstrap), preferences: preferencesSlice.reducer } });
}
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export function beginFeedRequest(store: AppStore, input: Parameters<typeof requestStarted>[0]) {
  store.dispatch(requestStarted(input));
  return store.getState().feed.request!;
}
