import type { SlipMatchState } from "../../domain/slip-match-state.ts";
import { shareUnchanged } from "../../domain/structural-sharing.ts";

type ObservationSnapshot = Readonly<{ states: readonly SlipMatchState[]; revoked: boolean }> | null;

/** Keep unchanged observations stable without retaining data across polling cohorts. */
export function createSlipMatchObservationStore(cohort: string) {
  let snapshot: ObservationSnapshot = null;
  const listeners = new Set<() => void>();
  return { cohort, getSnapshot: () => snapshot,
    subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    publish(value: Exclude<ObservationSnapshot, null>) {
      const next = shareUnchanged(snapshot, value);
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((notify) => notify());
    },
  };
}
