import type { SlipMatchState } from "../../domain/slip-match-state.ts";
import { shareUnchanged } from "../../domain/structural-sharing.ts";

type ObservationSnapshot = Readonly<{ states: readonly SlipMatchState[]; revoked: boolean; asOf?: number }> | null;

/** An older accepted poll cannot replace a newer server snapshot of the same editorial cohort. */
export function currentSlipMatchStates(initialStates: readonly SlipMatchState[], initialAsOf: number | undefined, snapshot: ObservationSnapshot) {
  if (snapshot && (snapshot.revoked || initialAsOf === undefined || (snapshot.asOf ?? -Infinity) > initialAsOf)) return snapshot.states;
  return initialStates;
}

/** The original kickoff ends the pre-match display once, even in an open view without polling. */
export function createSlipKickoffExpiry(kickoffAt: number) {
  let expired = false;
  return { getSnapshot: () => expired,
    subscribe(notify: () => void) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const check = () => {
        const remaining = kickoffAt - Date.now();
        if (remaining > 0) timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
        else { expired = true; notify(); }
      };
      if (!expired && Number.isFinite(kickoffAt)) check();
      return () => clearTimeout(timer);
    },
  };
}

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
