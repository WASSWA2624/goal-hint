"use client";

import { useEffect, type ComponentProps } from "react";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { Surface } from "@/components/ui/layout";
import { paymentDraftStorageKey } from "@/domain/member-navigation";

/** Compact information-page treatment with a readable single column and phone-sized actions. */
export const MemberPanel = styled(Surface)`
  inline-size: 100%;
  max-inline-size: 36rem;
  border-radius: 0;
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
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) location.reload(); };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}

export function MemberSignOut({ children, ...props }: ComponentProps<typeof Button>) {
  return <form method="post" action="/api/account/sign-out" onSubmit={() => {
    try { sessionStorage.removeItem(paymentDraftStorageKey); } catch { /* Browser storage may be disabled. */ }
  }} data-analytics-ignore><Button {...props} type="submit" variant="secondary">{children}</Button></form>;
}
