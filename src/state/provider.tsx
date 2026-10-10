"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import type { FeedBootstrap } from "./contracts";
import { makeStore } from "./store";
import { calendarChanged } from "./feed";
import { preferencesChanged, preferencesStorageKey, readPreferences, serializePreferences } from "./preferences";

/** A fresh lazy store for each rendered provider, with the same snapshot for hydration. */
export function FeedStateProvider({ initial, children }: { initial: FeedBootstrap; children: ReactNode }) {
  const [{ store, serverState }] = useState(() => {
    const store = makeStore(initial);
    return { store, serverState: store.getState() };
  });
  useEffect(() => {
    if (initial.today > store.getState().feed.today) store.dispatch(calendarChanged(initial.today));
  }, [initial.today, store]);
  useEffect(() => {
    try {
      const preferences = readPreferences(window.localStorage.getItem(preferencesStorageKey));
      if (preferences) store.dispatch(preferencesChanged(preferences));
    } catch { /* Storage can be blocked. URL and server state still work. */ }
    let previous = serializePreferences(store.getState().preferences);
    return store.subscribe(() => {
      const next = serializePreferences(store.getState().preferences);
      if (next === previous) return;
      previous = next;
      try { window.localStorage.setItem(preferencesStorageKey, next); } catch { /* Optional anonymous preference only. */ }
    });
  }, [store]);
  return <Provider store={store} serverState={serverState}>{children}</Provider>;
}
