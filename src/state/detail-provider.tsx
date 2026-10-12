"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeDetailStore } from "./detail-store";

/** Isolate each match's request cache while retaining the exact server snapshot for hydration. */
export function DetailStateProvider({ children }: { children: ReactNode }) {
  const [{ store, serverState }] = useState(() => {
    const store = makeDetailStore();
    return { store, serverState: store.getState() };
  });
  return <Provider store={store} serverState={serverState}>{children}</Provider>;
}
