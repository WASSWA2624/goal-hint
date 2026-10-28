"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { slipMatchSelectionKey, uniqueSlipMatchWatches } from "@/domain/slip-match-refresh";
import { readSlipMatchObservations, startSlipMatchPolling } from "@/domain/slip-match-polling";

const Observations = createContext<readonly SlipMatchState[] | undefined>(undefined);
type ObservationSnapshot = Readonly<{ states: readonly SlipMatchState[]; revoked: boolean }> | null;

function observationStore(cohort: string) {
  let snapshot: ObservationSnapshot = null;
  const listeners = new Set<() => void>();
  return { cohort, getSnapshot: () => snapshot,
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    publish(value: Exclude<ObservationSnapshot, null>) { snapshot = value; listeners.forEach((notify) => notify()); },
  };
}

function available() {
  return document.visibilityState === "visible" && navigator.onLine && !document.querySelector("[data-navigation-pending]");
}

/** One desktop-only observation loop per slip list; immutable picks and native disclosures stay mounted. */
export function SlipMatchRefreshProvider({ slips, initialStates = [], enabled, onAccessRevoked, accessFallback = null, children }: {
  slips: readonly BuiltSlip[]; initialStates?: readonly SlipMatchState[]; enabled: boolean;
  onAccessRevoked?: () => void; accessFallback?: ReactNode; children: ReactNode;
}) {
  const watches = [...uniqueSlipMatchWatches(slips.flatMap((slip) => slip.selections))]
    .sort((left, right) => slipMatchSelectionKey(left).localeCompare(slipMatchSelectionKey(right)));
  const body = JSON.stringify({ selections: watches });
  const store = useMemo(() => observationStore(body), [body]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const revoked = useRef(onAccessRevoked);
  useEffect(() => { revoked.current = onAccessRevoked; }, [onAccessRevoked]);
  useEffect(() => {
    if (!enabled) return;
    const selections = JSON.parse(store.cohort).selections as ReturnType<typeof uniqueSlipMatchWatches>;
    if (!selections.length) return;
    const allowed = new Set(selections.map(slipMatchSelectionKey));
    return startSlipMatchPolling({ enabled, read: (signal) => readSlipMatchObservations(store.cohort, allowed, signal),
      accept: (data) => store.publish({ states: data.states, revoked: false }),
      revoke: () => { store.publish({ states: [], revoked: true }); revoked.current?.(); },
    }, {
      available, schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: (timer) => window.clearTimeout(timer as number),
      listen: (callback) => {
        let previous = available();
        const changed = () => { const next = available(); if (next !== previous) { previous = next; callback(); } };
        const restored = (event: PageTransitionEvent) => { if (event.persisted) callback(); };
        const navigation = new MutationObserver(changed);
        navigation.observe(document.documentElement, { attributes: true, attributeFilter: ["data-navigation-pending"], childList: true, subtree: true });
        document.addEventListener("visibilitychange", changed);
        window.addEventListener("online", changed); window.addEventListener("offline", changed); window.addEventListener("pageshow", restored);
        return () => {
          navigation.disconnect(); document.removeEventListener("visibilitychange", changed);
          window.removeEventListener("online", changed); window.removeEventListener("offline", changed); window.removeEventListener("pageshow", restored);
        };
      },
    });
  }, [enabled, store]);
  // An accepted response, including an empty one, wins over later RSC seeds for the same cohort.
  const states = snapshot?.states ?? initialStates;
  return <Observations.Provider value={states}>{snapshot?.revoked ? accessFallback : children}</Observations.Provider>;
}

/** Undefined preserves callers outside the desktop polling provider; an empty array clears old observations. */
export function useRefreshedSlipMatchStates(): readonly SlipMatchState[] | undefined {
  return useContext(Observations);
}
