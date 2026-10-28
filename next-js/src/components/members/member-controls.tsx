"use client";

import { useEffect, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { paymentDraftStoragePrefix } from "@/domain/member-navigation";
import { getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";

/** Compact information-page treatment with a readable single column and phone-sized actions. */
export const MemberPanel = styled(Surface)`
  inline-size: 100%;
  max-inline-size: 36rem;
  button, a { min-block-size: 44px; }
  input { min-block-size: 44px; font-size: 16px; }
`;
export const MemberForm = styled.form`
  display: grid;
  gap: 12px;
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
  return <form method="post" action={logoutAction} onSubmit={() => {
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(paymentDraftStoragePrefix)) sessionStorage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
  }} data-analytics-ignore><Button variant="secondary" {...props} type="submit">{children}</Button></form>;
}
