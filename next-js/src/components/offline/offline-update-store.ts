import { initialOfflineRefreshState, type OfflineRefreshState } from "@/domain/offline-refresh";

let state = initialOfflineRefreshState;
const listeners = new Set<() => void>();
export const offlineUpdateSnapshot = () => state;
export const serverOfflineUpdateSnapshot = () => initialOfflineRefreshState;
export function subscribeOfflineUpdates(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function publishOfflineUpdate(next: OfflineRefreshState) {
  state = next;
  for (const listener of listeners) listener();
}
