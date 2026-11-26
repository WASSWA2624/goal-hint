"use client";

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { resetReviewAlerts } from "@/components/admin/payment-alert-sound";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { nativePaymentAlerts } from "@/domain/native-payment-alerts";
import { authCopy } from "@/i18n/messages/auth";
import { requestMemberLogout, type MemberLogoutAction } from "./account-request";
import { AccountError } from "./account-styles";
import { clearMemberSessionAfterLogout, ensureMemberSession, getAdminSessionSnapshot, getMemberSessionSnapshot, getSubscriptionSnapshot, hasConfirmedMemberSession, refreshMemberSession, subscribeMemberSession } from "./member-session";

/** Compact information-page treatment with a readable single column and phone-sized actions. */
export const MemberPanel = styled(Surface)`
  inline-size: 100%;
  max-inline-size: var(--gh-size-144);
  button, a { min-block-size: var(--form-control-height); }
  input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"]) { min-block-size: var(--form-control-height); font-size: var(--gh-font-section); }
`;
export const MemberForm = styled.form`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
`;

/** A restored page must recheck the server session, including after sign-out or a device eviction. */
export function MemberNavigationRecovery({ expectedPhone, expectedAdministrator }: { expectedPhone?: string | null; expectedAdministrator?: boolean } = {}) {
  const router = useRouter();
  useEffect(() => {
    let previous = getSubscriptionSnapshot(), previousPhone = getMemberSessionSnapshot(), confirmed = hasConfirmedMemberSession();
    let previousAdmin = getAdminSessionSnapshot(), initial = true, active = true;
    const reconcile = () => {
      if (!active || !hasConfirmedMemberSession()) return;
      const current = getSubscriptionSnapshot(), currentPhone = getMemberSessionSnapshot();
      const currentAdmin = getAdminSessionSnapshot();
      // Revoke stale private content after another tab signs out or this session is evicted.
      // Also cover a cookie change between the server render and the first browser identity read.
      const initialMismatch = initial && (expectedPhone !== undefined && expectedPhone !== currentPhone
        || expectedAdministrator !== undefined && expectedAdministrator !== currentAdmin);
      if (initialMismatch || confirmed && (previousPhone !== currentPhone || previousAdmin !== currentAdmin || previous?.activeUntil !== current?.activeUntil)) router.refresh();
      previous = current; previousPhone = currentPhone; previousAdmin = currentAdmin; confirmed = hasConfirmedMemberSession();
      initial = false;
    };
    const unsubscribe = subscribeMemberSession(reconcile);
    // The session store suppresses unchanged snapshots, so reconcile the initial read explicitly too.
    const mismatch = confirmed && (expectedPhone !== undefined && expectedPhone !== previousPhone
      || expectedAdministrator !== undefined && expectedAdministrator !== previousAdmin);
    void (mismatch ? refreshMemberSession() : ensureMemberSession()).then(reconcile);
    return () => { active = false; unsubscribe(); };
  }, [router, expectedPhone, expectedAdministrator]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}

async function clearSignOutAlerts() {
  resetReviewAlerts();
  try { navigator.serviceWorker?.controller?.postMessage({ type: "payment-alert-reconcile", events: [] }); }
  catch { /* The browser may have detached its worker. */ }
  const alerts = nativePaymentAlerts();
  if (!alerts) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(() => alerts.clear()),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); })]);
  } catch { window.dispatchEvent(new Event("goal-hint-payment-sign-out")); }
  finally { clearTimeout(timeout); }
}

export function MemberSignOut({ children, disabled, logoutAction = "/api/account/sign-out", onSignedOut, ...props }: ComponentProps<typeof Button> & {
  logoutAction?: MemberLogoutAction;
  onSignedOut?: () => void;
}) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting.current) return;
    submitting.current = true;
    setBusy(true); setFailed(false);
    try {
      const next = await requestMemberLogout(logoutAction);
      await clearSignOutAlerts().catch(() => {});
      onSignedOut?.();
      clearMemberSessionAfterLogout();
      // An authentication boundary needs fresh server content and must not keep the old account page in this history slot.
      location.replace(next);
    } catch {
      submitting.current = false;
      setBusy(false); setFailed(true);
    }
  }

  return <form method="post" action={logoutAction} onSubmit={submit} aria-busy={busy || undefined} data-analytics-ignore>
    <Button variant="secondary" {...props} disabled={disabled || busy} type="submit">{children}</Button>
    <AppLoading active={busy} />
    {failed && <AccountError role="alert">{authCopy.logoutUnavailable}</AccountError>}
  </form>;
}
