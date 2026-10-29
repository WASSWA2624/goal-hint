"use client";

import { useId, useRef, useState } from "react";
import styled from "styled-components";
import { formatPhone } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { AccountBlock, AccountBlockText, AccountFine } from "./account-overview";
import { accountRequest } from "./account-security";
import { AccountError } from "./account-styles";

const Preferences = styled(AccountBlock)`
  display: none;
  ${media.desktop} { display: flex; }
`;
export const AccountWhatsAppConsentLabel = styled.label`
  display: flex; align-items: start; gap: 10px; min-block-size: 44px; cursor: pointer;
  input { flex: none; inline-size: 18px; block-size: 18px; margin: 3px 0 0; accent-color: ${({ theme }) => theme.color.brand}; }
  span { display: grid; gap: 3px; }
  strong { font-size: 0.9375rem; }
`;

/** An explicit recipient choice controls future account updates; withdrawing it takes effect without sending a message. */
export function AccountNotificationPreferences({ locale, phone, whatsappNotificationsAt }: {
  locale: string; phone: string; whatsappNotificationsAt: string | null;
}) {
  const m = createMessages(locale), id = useId();
  const inFlight = useRef(false);
  const [consentAt, setConsentAt] = useState(whatsappNotificationsAt), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function update(enabled: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setSaved(false);
    try {
      const reply = await accountRequest<{ whatsappNotificationsAt: string | null }>("preferences", { whatsappNotifications: enabled });
      setConsentAt(reply.whatsappNotificationsAt); setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Preferences data-account-notifications data-analytics-ignore aria-busy={busy}>
    <AccountBlockText><AccountWhatsAppConsentLabel htmlFor={id}>
      <input id={id} type="checkbox" checked={!!consentAt} disabled={busy} aria-describedby={`${id}-purpose`}
        onChange={event => void update(event.currentTarget.checked)} />
      <span><strong>{m.text("account.whatsappUpdates")}</strong><AccountFine as="span" id={`${id}-purpose`}>{m.text("account.whatsappUpdatesPurpose", { phone: `+${formatPhone(phone)}` })}</AccountFine></span>
    </AccountWhatsAppConsentLabel>
      {busy ? <AccountFine role="status">{m.text("account.working")}</AccountFine>
        : saved && <AccountFine role="status">{m.text(consentAt ? "account.whatsappUpdatesEnabled" : "account.whatsappUpdatesDisabled")}</AccountFine>}
      {error && <AccountError role="alert">{error}</AccountError>}
    </AccountBlockText>
  </Preferences>;
}
