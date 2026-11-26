import { nativeAppIdentity } from "../../domain/app-download-presentation.ts";
import {
  ensureMemberSession, getAdminSessionSnapshot, getMemberSessionSnapshot, hasConfirmedMemberSession, refreshMemberSession, subscribeMemberSession,
} from "../members/member-session.ts";
import { automaticModalAvailable, observeModalAvailability, reserveAutomaticModal } from "../ui/automatic-modal.tsx";
import { randomId } from "../ui/random-id.ts";
import { postCommunityAction } from "./community-invitation-api.ts";
import {
  claimGuestInvitation, clearCommunityAttempt, communityStorageChanged, completeGuestConfirmation, confirmGuestJoined,
  guestConfirmationAvailable, guestHasJoined, hasPendingAccountAttempt, hasReturnedFromCommunity, isCommunityHandoffInProgress,
  lockCommunityConfirmation, markCommunityDeparture, readCommunityAttempt, reserveGuestConfirmation, startCommunityAttempt,
  type CommunityAttempt,
} from "./community-invitation-storage.ts";

type CommunityPromptTarget = { accountKey: string | null; attemptId: string };
export type CommunityPrompt = CommunityPromptTarget & (
  { kind: "invitation" } | { kind: "confirmation"; saving?: boolean; failed?: boolean }
);

/** Each public shell has one coordinator for both viewport layouts. */
export function startCommunityInvitationFlow(publish: (prompt: CommunityPrompt | null) => void) {
  let active = true, visible = false, hasLinks = false;
  let identity: string | null | undefined;
  let displayed: CommunityPrompt | null = null, waiting: CommunityPrompt | null = null;
  let checking = false, checkAgain = false;
  let releaseConfirmation: (() => void) | null = null;
  let releaseModal: (() => void) | null = null, stopObservingModal: (() => void) | null = null;
  let pendingWrite: { id: string; promise: ReturnType<typeof postCommunityAction> } | null = null;

  const foreground = () => active && document.visibilityState !== "hidden";

  function stopObserving() { stopObservingModal?.(); stopObservingModal = null; }

  function readyForPrompt() {
    if (!visible || !foreground()) return false;
    if (automaticModalAvailable()) { stopObserving(); return true; }
    stopObservingModal ??= observeModalAvailability(() => { if (waiting) reveal(); else check(); });
    return false;
  }

  function display(prompt: CommunityPrompt | null) {
    displayed = prompt;
    if (!prompt) { releaseModal?.(); releaseModal = null; }
    publish(prompt);
  }

  function discardPrompt() {
    waiting = null;
    releaseConfirmation?.();
    releaseConfirmation = null;
    if (displayed) display(null);
  }

  function reveal() {
    if (!waiting || displayed || !readyForPrompt()) return;
    if (waiting.kind === "invitation" && !hasLinks) { waiting = null; return; }
    releaseModal = reserveAutomaticModal();
    if (!releaseModal) return;
    const prompt = waiting;
    waiting = null;
    display(prompt);
  }

  function offer(prompt: CommunityPrompt) { waiting = prompt; reveal(); }

  async function offerConfirmation(accountKey: string | null, attempt: CommunityAttempt, stillCurrent: () => boolean) {
    const release = await lockCommunityConfirmation(attempt);
    if (!release) return;
    if (!stillCurrent() || !visible || readCommunityAttempt(accountKey)?.id !== attempt.id) { release(); return; }
    releaseConfirmation = release;
    offer({ kind: "confirmation", accountKey, attemptId: attempt.id });
  }

  async function evaluate(person: string | null) {
    const stillCurrent = () => active && identity === person;
    if (person === null) {
      if (!readyForPrompt() || guestHasJoined()) return;
      const attempt = readCommunityAttempt(null);
      if (attempt) {
        if (hasReturnedFromCommunity(attempt)) await offerConfirmation(null, attempt, stillCurrent);
      } else if (hasLinks && await claimGuestInvitation(() => stillCurrent() && hasLinks && readyForPrompt()) && stillCurrent()) {
        offer({ kind: "invitation", accountKey: null, attemptId: randomId() });
      }
      return;
    }

    if (!guestConfirmationAvailable() && (!visible || !hasLinks && !hasPendingAccountAttempt())) return;
    const status = await postCommunityAction({ action: "status" });
    if (!stillCurrent() || status.status !== "ok") return;
    const { accountKey } = status;
    let joined = status.joined;
    if (guestConfirmationAvailable() && await reserveGuestConfirmation(accountKey, stillCurrent) && stillCurrent()) {
      const result = await postCommunityAction({ action: "reconcile", accountKey });
      if (result.status !== "ok" || !result.joined) return;
      await completeGuestConfirmation(accountKey);
      joined = true;
    }
    if (!stillCurrent()) return;
    const attempt = readCommunityAttempt(accountKey);
    if (joined) {
      if (attempt) clearCommunityAttempt(accountKey, attempt.id);
      return;
    }
    if (!readyForPrompt()) return;
    if (attempt) {
      if (!hasReturnedFromCommunity(attempt)) return;
      let result = pendingWrite?.id === attempt.id ? await pendingWrite.promise : null;
      if (!stillCurrent()) return;
      if (!result || result.status === "unavailable") {
        result = await postCommunityAction({ action: "attempt", accountKey, attemptId: attempt.id });
      }
      if (!stillCurrent()) return;
      if (result.status === "ok" && !result.joined) {
        await offerConfirmation(accountKey, attempt, stillCurrent);
        return;
      }
      if (result.status === "stale" || result.status === "ok") clearCommunityAttempt(accountKey, attempt.id);
      if (result.status !== "stale") return;
    }
    if (!hasLinks) return;
    const attemptId = randomId();
    const result = await postCommunityAction({ action: "claim", accountKey, attemptId });
    if (!stillCurrent() || result.status !== "ok") return;
    if (result.invited && !result.joined && visible && hasLinks) offer({ kind: "invitation", accountKey, attemptId });
  }

  function check() {
    if (!foreground() || identity === undefined || displayed || waiting) return;
    if (checking) { checkAgain = true; return; }
    checking = true;
    void evaluate(identity).finally(() => {
      checking = false;
      if (checkAgain) { checkAgain = false; check(); }
    });
  }

  function sessionChanged() {
    if (!active || !hasConfirmedMemberSession()) return;
    const person = getMemberSessionSnapshot() ?? (getAdminSessionSnapshot() ? "administrator" : null);
    if (person !== identity) {
      identity = person;
      discardPrompt();
    }
    if (waiting) reveal(); else check();
  }

  function onReturn() { void refreshMemberSession().then(sessionChanged); }
  function onVisibility() { if (document.visibilityState === "hidden") markCommunityDeparture(); else onReturn(); }
  function onNativeInteraction() {
    if (!isCommunityHandoffInProgress()) return;
    markCommunityDeparture();
    onReturn();
  }
  function onStorage(event: StorageEvent) {
    if (!communityStorageChanged(event)) return;
    const prompt = displayed ?? waiting;
    if (prompt?.kind === "confirmation" && readCommunityAttempt(prompt.accountKey)?.id !== prompt.attemptId
      || prompt?.kind === "invitation" && prompt.accountKey === null && guestHasJoined()) discardPrompt();
  }

  const unsubscribe = subscribeMemberSession(sessionChanged);
  void ensureMemberSession().then(sessionChanged);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", markCommunityDeparture);
  window.addEventListener("pagehide", markCommunityDeparture);
  window.addEventListener("focus", onReturn);
  window.addEventListener("pageshow", onReturn);
  window.addEventListener("storage", onStorage);
  // Some native WebViews keep document visibility and focus while a platform app is open.
  const native = nativeAppIdentity(navigator.userAgent);
  if (native) {
    document.addEventListener("pointerdown", onNativeInteraction, true);
    document.addEventListener("keydown", onNativeInteraction, true);
  }

  return {
    configure(nextVisible: boolean, nextHasLinks: boolean) {
      visible = nextVisible;
      hasLinks = nextHasLinks;
      if (!visible || !hasLinks && (displayed ?? waiting)?.kind === "invitation") {
        discardPrompt();
        stopObserving();
      }
      if (waiting) reveal(); else check();
    },
    closeInvitation() { if (displayed?.kind === "invitation") display(null); },
    visitDestination() {
      if (displayed?.kind !== "invitation") return;
      const { accountKey, attemptId } = displayed;
      startCommunityAttempt(accountKey, attemptId);
      if (accountKey !== null) pendingWrite = { id: attemptId, promise: postCommunityAction({ action: "attempt", accountKey, attemptId }, true) };
      display(null);
    },
    async answer(joined: boolean) {
      if (displayed?.kind !== "confirmation" || displayed.saving) return;
      const { accountKey, attemptId } = displayed;
      const close = () => { if (active && displayed?.attemptId === attemptId) discardPrompt(); };
      display({ ...displayed, saving: true, failed: false });
      if (accountKey === null) {
        if (joined) await confirmGuestJoined();
        clearCommunityAttempt(null, attemptId);
        close();
        return;
      }
      const result = await postCommunityAction({ action: joined ? "yes" : "no", accountKey, attemptId });
      if (result.status === "ok" || result.status === "stale") {
        clearCommunityAttempt(accountKey, attemptId);
        close();
      } else if (result.status === "denied") {
        close();
        onReturn();
      } else if (active && displayed?.attemptId === attemptId) {
        display({ ...displayed, saving: false, failed: true });
      }
    },
    dispose() {
      active = false;
      unsubscribe();
      releaseConfirmation?.();
      releaseModal?.();
      stopObserving();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", markCommunityDeparture);
      window.removeEventListener("pagehide", markCommunityDeparture);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener("storage", onStorage);
      if (native) {
        document.removeEventListener("pointerdown", onNativeInteraction, true);
        document.removeEventListener("keydown", onNativeInteraction, true);
      }
    },
  };
}
