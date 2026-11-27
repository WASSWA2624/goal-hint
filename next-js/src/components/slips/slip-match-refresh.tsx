"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { BuiltSlip } from "@/domain/slip-builder";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { slipMatchRefreshRules, slipMatchSelectionKey, uniqueSlipMatchWatches, type SlipMatchRefreshResponse } from "@/domain/slip-match-refresh";
import { readSlipMatchObservations, startSlipMatchPolling } from "@/domain/slip-match-polling";
import { slipMatchPollingEnvironment } from "./slip-match-polling-environment";
import { createSlipMatchObservationStore, currentSlipMatchStates } from "./slip-match-observations";

const Observations = createContext<readonly SlipMatchState[] | undefined>(undefined);
const emptyStates: readonly SlipMatchState[] = [];

/** One observation loop per enabled slip list on desktop or phones; immutable picks and disclosures stay mounted. */
export function SlipMatchRefreshProvider({ slips, initialStates = emptyStates, initialAsOf, enabled, editorial = false, onAccessRevoked, accessFallback = null, children }: {
  slips: readonly BuiltSlip[]; initialStates?: readonly SlipMatchState[]; enabled: boolean;
  editorial?: boolean; initialAsOf?: number;
  onAccessRevoked?: () => void; accessFallback?: ReactNode; children: ReactNode;
}) {
  const body = useMemo(() => {
    const watches = [...uniqueSlipMatchWatches(slips.flatMap((slip) => slip.selections))]
      .map((watch) => ({ watch, key: slipMatchSelectionKey(watch) }))
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(({ watch }) => watch);
    return JSON.stringify({ selections: watches, ...(editorial ? { editorial: true } : {}) });
  }, [editorial, slips]);
  const store = useMemo(() => createSlipMatchObservationStore(body), [body]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
  const states = useMemo(() => snapshot?.revoked ? null : currentSlipMatchStates(initialStates, initialAsOf, snapshot), [initialAsOf, initialStates, snapshot]);
  const revoked = useRef(onAccessRevoked);
  useEffect(() => { revoked.current = onAccessRevoked; }, [onAccessRevoked]);
  useEffect(() => {
    if (!enabled) return;
    const selections = JSON.parse(store.cohort).selections as ReturnType<typeof uniqueSlipMatchWatches>;
    if (!selections.length) return;
    const maximum = slipMatchRefreshRules.maximumSelections;
    const batches: { body: string; allowed: ReadonlySet<string> }[] = [];
    for (let start = 0; start < selections.length; start += maximum) {
      const watches = selections.slice(start, start + maximum);
      batches.push({ body: selections.length <= maximum ? store.cohort : JSON.stringify({ selections: watches, ...(editorial ? { editorial: true } : {}) }),
        allowed: new Set(watches.map(slipMatchSelectionKey)) });
    }
    // Oversized appended lists rotate through bounded requests at the existing polling cadence.
    const observed = new Map<number, SlipMatchRefreshResponse>();
    let index = 0;
    return startSlipMatchPolling({ enabled, read: (signal) => {
      const batch = batches[index]!;
      return readSlipMatchObservations(batch.body, batch.allowed, signal);
    }, accept: (data) => {
      if (batches.length === 1) store.publish({ states: data.states, revoked: false, ...(editorial ? { asOf: data.asOf } : {}) });
      else {
        observed.set(index, data);
        index = (index + 1) % batches.length;
        store.publish({ states: emptyStates, revoked: false, batches: [...observed.values()] });
      }
    },
      revoke: () => { store.publish({ states: [], revoked: true }); revoked.current?.(); },
    }, slipMatchPollingEnvironment());
  }, [editorial, enabled, store]);
  return <Observations.Provider value={states ?? emptyStates}>{states === null ? accessFallback : children}</Observations.Provider>;
}

/** Undefined preserves callers outside a polling provider; an empty array clears old observations. */
export function useRefreshedSlipMatchStates(): readonly SlipMatchState[] | undefined {
  return useContext(Observations);
}
