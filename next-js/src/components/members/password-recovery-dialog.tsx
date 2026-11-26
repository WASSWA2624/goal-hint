"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { memberAuthPath } from "@/domain/member-navigation";
import { normalizePhone, smsHref, telHref, waHref } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { AccountActions, AccountError, AccountLink, AccountNote } from "./account-styles";
import { accountRequest } from "./account-request";
import type { AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";

type RequestStatus = "requested" | "existing";

export function PasswordRecoveryDialog({ locale, contact, phone: initialPhone, returnTo, checkout, onClose }: {
  locale: string; contact: AdminContact; phone: string; returnTo: string | null; checkout: boolean; onClose: () => void;
}) {
  const messages = createMessages(locale);
  const id = useId(), formId = `${id}-recovery`;
  const inFlight = useRef(false), resultText = useRef<HTMLParagraphElement>(null);
  const [phone, setPhone] = useState(initialPhone), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<RequestStatus | null>(null);
  const text = messages.text("account.resetMessage");
  const smsPhone = contact.contactPhone ?? contact.whatsappPhone;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const canonical = normalizePhone(phone);
    if (!canonical) { setError(messages.text("phone.invalid")); return; }
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const response = await accountRequest<{ status: RequestStatus }>("forgot", { phone: canonical });
      if (response.status !== "requested" && response.status !== "existing") throw new Error(messages.text("account.unavailable"));
      setStatus(response.status);
      requestAnimationFrame(() => resultText.current?.focus());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : messages.text("account.unavailable"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <CriteriaDialog id={id} title={messages.text(status ? "account.resetPassword" : "account.recoveryQuestion")}
    open onCancel={onClose} closeLabel={messages.text("account.recoveryClose")} busy={busy} footer={status
      ? <CriteriaDialogButton type="button" onClick={onClose}>{messages.text("account.recoveryClose")}</CriteriaDialogButton>
      : <>
        <CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={onClose}>{messages.text("account.recoveryNo")}</CriteriaDialogButton>
        <CriteriaDialogButton type="submit" form={formId} disabled={busy}>{messages.text("account.recoveryYes")}</CriteriaDialogButton>
      </>}>
    {status ? <>
      <p ref={resultText} tabIndex={-1} role="status">{messages.text(status === "existing" ? "account.recoveryExisting" : "account.recoveryRequested")}</p>
      <AccountActions aria-label={messages.text("account.support")} role="group">
        {contact.contactPhone && <AccountLink href={telHref(contact.contactPhone)} data-analytics-ignore>{messages.text("subscribe.callAdmin")}</AccountLink>}
        {contact.whatsappPhone && <AccountLink href={waHref(contact.whatsappPhone, text)} data-analytics-ignore>{messages.text("subscribe.whatsappAdmin")}</AccountLink>}
        {smsPhone && <AccountLink href={smsHref(smsPhone, text)} data-analytics-ignore>{messages.text("account.recoverySmsAdmin")}</AccountLink>}
      </AccountActions>
      <AccountNote><AccountLink href={`/${resolveLocale(locale)}/contact`} prefetch={false}>{messages.text("account.recoveryContactOptions")}</AccountLink></AccountNote>
    </> : <MemberForm id={formId} method="post" action="/api/account/forgot" onSubmit={submit} data-analytics-ignore>
      <PhoneInput name="phone" label={messages.text("account.registeredNumber")} value={phone} onValueChange={value => {
        setPhone(value); setError("");
      }} lookup required disabled={busy} hint="" />
      {error && <AccountError role="alert">{error}</AccountError>}
      <AccountNote><AccountLink href={memberAuthPath("reset-code", returnTo, checkout)} prefetch={false}>{messages.text("account.recoveryPriorCode")}</AccountLink></AccountNote>
    </MemberForm>}
  </CriteriaDialog>;
}
