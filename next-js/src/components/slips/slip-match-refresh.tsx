"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { slipMatchSelectionKey, uniqueSlipMatchWatches } from "@/domain/slip-match-refresh";
import { readSlipMatchObservations, startSlipMatchPolling } from "@/domain/slip-match-polling";
import { slipMatchPollingEnvironment } from "./slip-match-polling-environment";

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

/** One observation loop per enabled slip list on desktop or phones; immutable picks and disclosures stay mounted. */
export function SlipMatchRefreshProvider({ slips, initialStates = [], enabled, onAccessRevoked, accessFallback = null, children }: {
  slips: readonly BuiltSlip[]; initialStates?: readonly SlipMatchState[]; enabled: boolean;
  onAccessRevoked?: () => void; accessFallback?: ReactNode; children: ReactNode;
}) {
  const body = useMemo(() => {
    const watches = [...uniqueSlipMatchWatches(slips.flatMap((slip) => slip.selections))]
      .map((watch) => ({ watch, key: slipMatchSelectionKey(watch) }))
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(({ watch }) => watch);
    return JSON.stringify({ selections: watches });
  }, [slips]);
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
    }, slipMatchPollingEnvironment());
  }, [enabled, store]);
  // An accepted response, including an empty one, wins over later RSC seeds for the same cohort.
  const states = snapshot?.states ?? initialStates;
  return <Observations.Provider value={states}>{snapshot?.revoked ? accessFallback : children}</Observations.Provider>;
}

/** Undefined preserves callers outside a polling provider; an empty array clears old observations. */
export function useRefreshedSlipMatchStates(): readonly SlipMatchState[] | undefined {
  return useContext(Observations);
}
