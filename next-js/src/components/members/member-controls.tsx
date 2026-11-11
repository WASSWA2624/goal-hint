"use client";

import { useEffect, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { resetReviewAlerts } from "@/components/admin/payment-alert-sound";
import { nativePaymentAlerts } from "@/domain/native-payment-alerts";
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

export function MemberSignOut({ children, logoutAction = "/api/account/sign-out", ...props }: ComponentProps<typeof Button> & {
  logoutAction?: "/api/account/sign-out" | "/api/account/sign-out?destination=login" | "/api/admin/logout";
}) {
  return <form method="post" action={logoutAction} onSubmit={event => {
    resetReviewAlerts();
    if ("serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage({ type: "payment-alert-reconcile", events: [] });
    window.dispatchEvent(new Event("goal-hint-payment-sign-out"));
    const alerts = nativePaymentAlerts();
    if (alerts) {
      event.preventDefault();
      const form = event.currentTarget;
      void Promise.race([alerts.clear(), new Promise(resolve => setTimeout(resolve, 1500))])
        .catch(() => {}).finally(() => form.submit());
    }
    clearProtectedDrafts();
  }} data-analytics-ignore><Button variant="secondary" {...props} type="submit">{children}</Button></form>;
}
