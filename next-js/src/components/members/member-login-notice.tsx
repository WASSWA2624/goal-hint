"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { createMessages } from "@/i18n/messages";
import { consumeMemberLoginFlash, type MemberLoginFlash } from "./member-login-flash";

let notice: MemberLoginFlash | null = null;
const listeners = new Set<() => void>();
const snapshot = () => notice;
const serverSnapshot = () => null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function update(next: MemberLoginFlash | null) {
  if (notice === next) return;
  notice = next;
  for (const listener of listeners) listener();
}

// Local styles: the owner dashboard's Notice would pull all of its styles into every public page.
const LoginNotice = styled.div`
  position: fixed; inset-block-start: max(12px, env(safe-area-inset-top)); inset-inline: 12px;
  z-index: 100; max-inline-size: 36rem; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px;
  border-inline-start: 4px solid; border-radius: ${({ theme }) => theme.border.radius}; font-size: ${({ theme }) => theme.typography.scale.body};
  color: ${({ theme }) => theme.color.outcome.correct.text};
  background: ${({ theme }) => theme.color.outcome.correct.background};
  border-color: ${({ theme }) => theme.color.outcome.correct.border};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  button { flex: none; min-block-size: 44px; margin: 0; }
`;

/** Global placement also confirms phone-admin logins, logins returning to a match and sign-outs landing on the matches. */
export function MemberLoginNotice() {
  const pathname = usePathname();
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const messages = createMessages();
  useEffect(() => {
    const saved = consumeMemberLoginFlash();
    if (saved) update(saved);
  }, [pathname]);
  if (!current) return null;
  return <LoginNotice role="status" aria-live="polite" aria-atomic="true" data-login-notice>
    <span>{messages.text(current === "other-device-signed-out" ? "account.otherDeviceSignedOut" : current === "signed-out" ? "account.signedOutBrowsing" : "account.loginSuccessful")}</span>
    <Button type="button" variant="secondary" onClick={() => update(null)}>{messages.text("account.dismissNotice")}</Button>
  </LoginNotice>;
}
