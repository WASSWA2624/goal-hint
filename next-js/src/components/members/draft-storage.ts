import { paymentDraftStoragePrefix } from "../../domain/member-navigation.ts";

const prefix = "goal-hint.purchase-progress:";
const checkoutDatabase = "goal-hint-checkout";
export const purchaseDraftLifetimeMs = 30 * 60 * 1000;
const protectedMemory = new Map<string, { value: unknown; expiresAt: number }>();
const retiredScopes = new Set<string>();
let activeScope: string | undefined;
let legacyDatabaseDeletion: IDBOpenDBRequest | undefined;

function removeStoredDrafts(matches: (key: string) => boolean) {
  try {
    for (const key of Object.keys(sessionStorage)) if (matches(key)) sessionStorage.removeItem(key);
  } catch { /* Storage may be blocked. */ }
}

export function purgeLegacyDrafts() {
  removeStoredDrafts(key => key.startsWith(paymentDraftStoragePrefix));
  if (legacyDatabaseDeletion) return;
  try {
    legacyDatabaseDeletion = indexedDB.deleteDatabase(checkoutDatabase);
    legacyDatabaseDeletion.onerror = () => { legacyDatabaseDeletion = undefined; };
  } catch { /* IndexedDB may be blocked. */ }
}

export function clearProtectedDrafts() {
  protectedMemory.clear();
  if (activeScope) retiredScopes.add(activeScope);
  activeScope = undefined;
  removeStoredDrafts(key => key.startsWith(prefix));
  purgeLegacyDrafts();
}

function draftKey(scope: string, kind: string) {
  if (activeScope !== scope) {
    protectedMemory.clear();
    if (activeScope) retiredScopes.add(activeScope);
    removeStoredDrafts(key => key.startsWith(prefix) && !key.startsWith(`${prefix}${scope}:`));
    activeScope = scope;
    purgeLegacyDrafts();
  }
  return `${prefix}${scope}:${kind}`;
}

export function readDraftProgress(scope: string, kind: string): string | null {
  if (retiredScopes.has(scope)) return null;
  try { return sessionStorage.getItem(`${prefix}${scope}:${kind}`); } catch { return null; }
}

export function decodeDraftProgress(raw: string | null, now = Date.now()): Record<string, unknown> | null {
  try {
    const { expiresAt, selection } = JSON.parse(raw ?? "null") ?? {};
    return Number.isSafeInteger(expiresAt) && expiresAt > now && expiresAt <= now + purchaseDraftLifetimeMs
      && selection && typeof selection === "object" && !Array.isArray(selection) ? selection : null;
  } catch { return null; }
}

/** Callers must provide a separate allowlisted projection. Only in-memory drafts hold evidence. */
export function writeDraftProgress(scope: string, kind: string, selection: object | null, fullDraft?: unknown) {
  if (retiredScopes.has(scope)) return;
  const key = draftKey(scope, kind), expiresAt = Date.now() + purchaseDraftLifetimeMs;
  if (fullDraft !== undefined) protectedMemory.set(key, { value: fullDraft, expiresAt });
  try {
    if (!selection) { sessionStorage.removeItem(key); return; }
    const existing = decodeDraftProgress(sessionStorage.getItem(key));
    if (!existing || JSON.stringify(existing) !== JSON.stringify(selection)) sessionStorage.setItem(key, JSON.stringify({ expiresAt, selection }));
  } catch { /* In-memory use still works. */ }
}

export function readDraftMemory<T>(scope: string, kind: string): T | null {
  if (retiredScopes.has(scope)) return null;
  const key = draftKey(scope, kind), stored = protectedMemory.get(key);
  if (!stored) return null;
  if (stored.expiresAt > Date.now()) return stored.value as T;
  protectedMemory.delete(key);
  return null;
}

export function clearDraftProgress(scope: string, kind: string) {
  if (retiredScopes.has(scope)) return;
  const key = draftKey(scope, kind);
  protectedMemory.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ }
}
