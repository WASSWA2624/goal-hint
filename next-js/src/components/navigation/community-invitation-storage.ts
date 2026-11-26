import { communityReminderIntervalMs } from "../../domain/community.ts";
import { randomId } from "../ui/random-id.ts";

const guestKey = "goal-hint-community-guest-v1";
const attemptPrefix = "goal-hint-community-attempt-v1:";
const accountAttemptPrefix = `${attemptPrefix}account:`;
const memory = new Map<string, string>();
const failedWrites = new Set<string>();

type Guest = { invitedAt: number; joined: boolean; transferTo: string | null };
export type CommunityAttempt = Readonly<{ id: string; source: string }>;

let pageId: string | undefined;
let departed = false;

function read(key: string): unknown {
  let raw: string | null | undefined = memory.get(key);
  if (!failedWrites.has(key)) {
    try { raw = localStorage.getItem(key); } catch { /* Keep the in-memory state. */ }
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function write(key: string, value: object | null) {
  const raw = value === null ? null : JSON.stringify(value);
  if (raw === null) memory.delete(key); else memory.set(key, raw);
  try {
    if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
    failedWrites.delete(key);
  } catch { failedWrites.add(key); }
}

function readGuest(): Guest {
  const value = read(guestKey);
  if (!value || typeof value !== "object" || !("invitedAt" in value) || !("joined" in value) || !("transferTo" in value)
    || typeof value.invitedAt !== "number" || !Number.isFinite(value.invitedAt) || typeof value.joined !== "boolean"
    || value.transferTo !== null && typeof value.transferTo !== "string") return { invitedAt: -Infinity, joined: false, transferTo: null };
  return { invitedAt: value.invitedAt, joined: value.joined, transferTo: value.transferTo };
}

const withGuestLock = <T>(action: () => T): Promise<T> => navigator.locks
  ? navigator.locks.request(guestKey, action).catch(() => action()) : Promise.resolve(action());

export const guestHasJoined = () => readGuest().joined;
export const guestConfirmationAvailable = () => readGuest().transferTo !== null;

export function claimGuestInvitation(canShow: () => boolean) {
  return withGuestLock(() => {
    const guest = readGuest(), now = Date.now();
    if (!canShow() || guest.joined || now - guest.invitedAt < communityReminderIntervalMs) return false;
    write(guestKey, { ...guest, invitedAt: now });
    return true;
  });
}

export function confirmGuestJoined() {
  return withGuestLock(() => {
    const guest = readGuest();
    if (!guest.joined) write(guestKey, { ...guest, invitedAt: Number.isFinite(guest.invitedAt) ? guest.invitedAt : Date.now(), joined: true, transferTo: "" });
  });
}

/** Only the first account on the device may adopt this guest's confirmation. */
export function reserveGuestConfirmation(accountKey: string, canTransfer: () => boolean) {
  return withGuestLock(() => {
    const guest = readGuest();
    if (!canTransfer() || !guest.joined || guest.transferTo === null || guest.transferTo !== "" && guest.transferTo !== accountKey) return false;
    if (guest.transferTo === "") write(guestKey, { ...guest, transferTo: accountKey });
    return true;
  });
}

export function completeGuestConfirmation(accountKey: string) {
  return withGuestLock(() => {
    const guest = readGuest();
    if (guest.transferTo === accountKey) write(guestKey, { ...guest, transferTo: null });
  });
}

const attemptKey = (accountKey: string | null) => accountKey === null ? `${attemptPrefix}guest` : accountAttemptPrefix + accountKey;

export function hasPendingAccountAttempt() {
  for (const key of failedWrites) if (key.startsWith(accountAttemptPrefix) && memory.has(key)) return true;
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(accountAttemptPrefix) && !failedWrites.has(key)) return true;
    }
  } catch { return [...memory.keys()].some(key => key.startsWith(accountAttemptPrefix)); }
  return false;
}

export function readCommunityAttempt(accountKey: string | null): CommunityAttempt | null {
  const value = read(attemptKey(accountKey));
  return value && typeof value === "object" && "id" in value && typeof value.id === "string"
    && "source" in value && typeof value.source === "string" ? { id: value.id, source: value.source } : null;
}

export function startCommunityAttempt(accountKey: string | null, id: string) {
  pageId ??= randomId();
  departed = false;
  write(attemptKey(accountKey), { id, source: pageId });
}

export function clearCommunityAttempt(accountKey: string | null, id: string) {
  if (readCommunityAttempt(accountKey)?.id === id) write(attemptKey(accountKey), null);
}

export function markCommunityDeparture() { departed = true; }

/** An outbound click alone leaves this document ineligible to ask. */
export function hasReturnedFromCommunity(attempt: CommunityAttempt) {
  return attempt.source !== pageId || departed;
}

export function isCommunityHandoffInProgress() { return pageId !== undefined && !departed; }

/** Prevent two tabs of this browser from displaying the same return prompt. */
export function lockCommunityConfirmation(attempt: CommunityAttempt): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise(resolve => {
    void navigator.locks.request(`${attemptPrefix}confirmation:${attempt.id}`, { ifAvailable: true }, lock => {
      if (!lock) { resolve(null); return; }
      return new Promise<void>(release => resolve(release));
    }).catch(() => resolve(null));
  });
}

export function communityStorageChanged(event: StorageEvent) {
  return event.key === null || event.key === guestKey || event.key.startsWith(attemptPrefix);
}
