"use client";

import { useEffect, useState, type ReactNode } from "react";

let reserved = false;
const listeners = new Set<() => void>();

export function automaticModalAvailable() {
  return !reserved && ![...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')]
    .some(dialog => dialog.getClientRects().length > 0);
}

/** Reserve before mounting so two automatic prompts cannot both start in the same render. */
export function reserveAutomaticModal() {
  if (!automaticModalAvailable()) return null;
  reserved = true;
  return () => {
    reserved = false;
    for (const listener of listeners) queueMicrotask(listener);
  };
}

export function observeModalAvailability(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden", "aria-modal"] });
  listeners.add(listener);
  return () => { listeners.delete(listener); observer.disconnect(); };
}

export function DeferredAutomaticModal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true, release: (() => void) | null = null;
    const check = () => {
      if (!active || release || document.visibilityState === "hidden") return;
      release = reserveAutomaticModal();
      if (release) { stopObserving(); setReady(true); }
    };
    const stopObserving = observeModalAvailability(check);
    document.addEventListener("visibilitychange", check);
    queueMicrotask(check);
    return () => {
      active = false;
      stopObserving();
      release?.();
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return ready ? children : null;
}
