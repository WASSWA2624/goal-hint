"use client";

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { resetReviewAlerts } from "@/components/admin/payment-alert-sound";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { nativePaymentAlerts, type NativePaymentAlertBridge } from "@/domain/native-payment-alerts";
import { ensureMemberSession, getAdminSessionSnapshot, getMemberSessionSnapshot, getSubscriptionSnapshot, hasConfirmedMemberSession, refreshMemberSession, subscribeMemberSession } from "./member-session";
import { clearProtectedDrafts } from "./draft-storage";

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

async function clearNativeSignOutAlerts(alerts: NativePaymentAlertBridge) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.resolve().then(() => alerts.clear()),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); })]);
  } catch { window.dispatchEvent(new Event("goal-hint-payment-sign-out")); }
  finally { clearTimeout(timeout); }
}

export function MemberSignOut({ children, disabled, logoutAction = "/api/account/sign-out", onLogoutStart, ...props }: ComponentProps<typeof Button> & {
  logoutAction?: "/api/account/sign-out" | `/api/account/sign-out?${string}` | "/api/admin/logout";
  onLogoutStart?: () => void;
}) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { submitting.current = false; setBusy(false); }
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (disabled || submitting.current) { event.preventDefault(); return; }
    submitting.current = true;
    setBusy(true);
    onLogoutStart?.();
    clearProtectedDrafts();
    try {
      resetReviewAlerts();
      navigator.serviceWorker?.controller?.postMessage({ type: "payment-alert-reconcile", events: [] });
    } catch { /* Alert cleanup must not stop the form submission. */ }

    const alerts = nativePaymentAlerts();
    if (!alerts) return; // The browser follows the server redirect without JavaScript reading the response.
    event.preventDefault();
    const form = event.currentTarget;
    void clearNativeSignOutAlerts(alerts).finally(() => {
      // An in-app navigation can unmount the menu during the bounded cleanup.
      const target = form.isConnected ? form : form.cloneNode(true) as HTMLFormElement;
      if (target !== form) { target.hidden = true; document.body.append(target); }
      HTMLFormElement.prototype.submit.call(target);
    });
  }

  return <form method="post" action={logoutAction} onSubmit={submit} aria-busy={busy || undefined} data-analytics-ignore>
    <input type="hidden" name="action" value="logout" />
    <Button variant="secondary" {...props} disabled={disabled || busy} type="submit">{children}</Button>
    <AppLoading active={busy} />
  </form>;
}
