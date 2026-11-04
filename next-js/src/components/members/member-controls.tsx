"use client";

import { useEffect, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { resetReviewAlerts } from "@/components/admin/payment-alert-sound";
import { nativePaymentAlerts } from "@/domain/native-payment-alerts";
import { getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";
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
export function MemberNavigationRecovery() {
  const router = useRouter();
  useEffect(() => {
    let previous = getSubscriptionSnapshot();
    return subscribeMemberSession(() => {
      const current = getSubscriptionSnapshot();
      // Approval or expiry changes the gated content too; initial hydration needs no extra request.
      if (previous && current && previous.activeUntil !== current.activeUntil) router.refresh();
      previous = current;
    });
  }, [router]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}

export function MemberSignOut({ children, logoutAction = "/api/account/sign-out", ...props }: ComponentProps<typeof Button> & {
  logoutAction?: "/api/account/sign-out" | "/api/admin/logout";
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
