"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/controls";
import { offlineUpdateSnapshot, serverOfflineUpdateSnapshot, subscribeOfflineUpdates } from "./offline-update-store";

/** Public update availability, separate from account/session status. No forced reload or focus change. */
export function OfflineUpdateNotice() {
  const state = useSyncExternalStore(subscribeOfflineUpdates, offlineUpdateSnapshot, serverOfflineUpdateSnapshot);
  let message: string | null = null;
  if (state.phase === "checking") message = "Checking for saved-view updates…";
  else if (state.connection === "offline") message = "You’re offline. Updates will retry while this app is open.";
  else if (state.connection === "unreachable") message = "Goal Hint is unavailable. The saved view is unchanged; updates will retry.";
  else if (state.connection === "unusable" || state.connection === "authentication-required") message = "The server could not provide an update. The saved view is unchanged; updates will retry.";
  else if (state.problem === "storage-unavailable" || state.problem === "coordination-unavailable" || state.problem === "size-limit") message = "Updates could not be saved on this device. The previous saved view is unchanged.";
  else if (state.phase === "waiting") message = "The saved view is unchanged. Updates will retry while this app is open.";
  else if (state.connection === "reachable") message = "The saved view was checked. Open the online app when you’re ready.";
  return <>
    {message && <p role="status" data-offline-update-notice>{message}</p>}
    <Button variant="quiet" disabled={state.phase === "checking"} onClick={() => window.dispatchEvent(new Event("goal-hint-offline-check"))}>
      Check for updates
    </Button>
  </>;
}
