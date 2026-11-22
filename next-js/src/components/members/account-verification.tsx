"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SegmentedChoice, TextInput } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChevronRightIcon, KeyIcon, LockIcon, MailIcon } from "@/components/ui/icons";
import { messageChannels, supportedMessageChannels, type MessageChannel } from "@/domain/member-verification";
import { normalizePhone } from "@/domain/phone";
import { parseVerificationCode } from "@/domain/verification-code";
import { memberAuthPath } from "@/domain/member-navigation";
import { createMessages } from "@/i18n/messages";
import { AccountFormSupport, type AdminContact } from "./admin-contact";
import { AccountFormHeader } from "./account-form-header";
import { accountRequest } from "./account-request";
import { AccountCard, AccountCardBody, AccountCodeField, AccountError, AccountLink, AccountNote, AccountPrimary,
  AccountSecondaryActions, AccountSteps, AccountTextButton } from "./account-styles";
import { MemberForm, MemberSignOut } from "./member-controls";

type CodeFormProps = { locale: string; returnTo: string | null; contact: AdminContact } & (
  { purpose: "account"; phone: string } | { purpose: "password-reset"; phone?: string }
);

/** Both verification flows keep codes in component memory and submit only after an explicit confirmation. */
function AccountCodeForm({ locale, returnTo, contact, ...flow }: CodeFormProps) {
  const m = createMessages(locale), recovery = flow.purpose === "password-reset";
  const [phone, setPhone] = useState(flow.phone ?? "256");
  const [channel, setChannel] = useState<MessageChannel | "">("sms"), [code, setCode] = useState("");
  const [step, setStep] = useState<"delivery" | "code">(recovery ? "delivery" : "code");
  const [requested, setRequested] = useState(false), [error, setError] = useState(""), [invalidCode, setInvalidCode] = useState(false);
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const codeInput = useRef<HTMLInputElement>(null), codeRevision = useRef(0), clipboardPending = useRef(false);
  const canonicalPhone = normalizePhone(phone);
  const channels = canonicalPhone ? supportedMessageChannels(canonicalPhone) : messageChannels;
  const selectedChannel = channel && channels.includes(channel) ? channel : channels.includes("sms") ? "sms" : channels[0] ?? "";
  const sendLabel = selectedChannel ? m.text("account.sendCodeBy", { channel: selectedChannel === "sms" ? "SMS" : "WhatsApp" }) : m.text("account.sendCode");
  const loginHref = memberAuthPath("login", returnTo);
  const hasRestrictedSession = !recovery || !!flow.phone;
  const returnBody = returnTo ? { return: returnTo } : {};
  function updateCode(value: string) { codeRevision.current++; setCode(value); setInvalidCode(false); setError(""); }
  const changePhone = (value: string) => {
    if (value === phone) return;
    setPhone(value); setChannel("sms"); updateCode(""); setRequested(false);
  };
  function changeStep(next: "delivery" | "code") {
    if (busy || next === "code" && !canonicalPhone) return;
    updateCode(""); setStep(next);
  }
  useEffect(() => { if (step === "code") codeInput.current?.focus(); }, [step]);

  function pasteCode(value: unknown, reportError: boolean) {
    const parsed = parseVerificationCode(value);
    if (parsed !== null) updateCode(parsed);
    else { codeRevision.current++; if (reportError) { setInvalidCode(true); setError(""); } }
  }
  async function readCopiedCode(input: HTMLInputElement) {
    // A deliberate click/tap may allow clipboard access; automatic focus never requests it.
    if (busy || step !== "code" || input.value || clipboardPending.current || !window.isSecureContext || !navigator.clipboard?.readText) return;
    const revision = codeRevision.current;
    clipboardPending.current = true;
    try {
      const copied = await navigator.clipboard.readText();
      if (input.isConnected && document.activeElement === input && !input.disabled && !input.value && revision === codeRevision.current)
        pasteCode(copied, false);
    } catch { /* Native paste, keyboard suggestions and manual entry remain available. */ }
    finally { clipboardPending.current = false; }
  }
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recovery || busy || !canonicalPhone || !selectedChannel) return;
    setBusy("request"); setError("");
    try {
      await accountRequest("forgot", { phone, channel: selectedChannel, ...returnBody });
      setRequested(true); updateCode(""); setStep("code");
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(null); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || recovery && !canonicalPhone) return;
    const parsed = parseVerificationCode(code);
    if (parsed === null || invalidCode) { setInvalidCode(true); return; }
    setBusy("verify"); setError("");
    try {
      const result = await accountRequest<{ next: string }>(recovery ? "reset-code" : "verify", {
        ...(recovery ? { phone } : {}), code: parsed, ...returnBody });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(null); }
  }
  return <AccountCard data-account-auth data-account-verification={flow.purpose} data-verification-step={step} data-analytics-ignore>
    <AccountFormHeader icon={step === "code" ? KeyIcon : LockIcon}
      title={m.text(recovery ? step === "code" ? "account.enterCode" : "account.resetPassword" : "account.verifyAccount")}
      description={m.text(recovery ? step === "code" ? "account.resetSteps" : "account.resetHelp" : "account.codeHelp")} />
    <AccountCardBody>
      {step === "delivery" ? <>
        <MemberForm method="post" action="/api/account/forgot" onSubmit={request}
          data-account-step-form="delivery" data-analytics-ignore aria-busy={busy === "request"}>
          <PhoneInput name="phone" label={m.text("account.registeredNumber")} value={phone} onValueChange={changePhone} lookup required disabled={!!busy} hint="" />
          {channels.length > 0 ? <SegmentedChoice<MessageChannel | ""> name="channel" label={m.text("account.deliveryChannel")} value={selectedChannel}
            options={channels.map(value => ({ value, label: value === "sms" ? "SMS" : "WhatsApp" }))} onValueChange={setChannel} disabled={!!busy} />
            : <AccountNote role="status">{m.text("account.countryUnsupported")}</AccountNote>}
          {selectedChannel === "whatsapp" && <AccountNote>{m.text("account.whatsappConsent")}</AccountNote>}
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={!!busy || !canonicalPhone || !selectedChannel}>{sendLabel}<ChevronRightIcon /></AccountPrimary>
        </MemberForm>
      </> : <>
        {recovery && <AccountSteps aria-label={m.text("account.verificationSteps")}>
          <li><MailIcon />{m.text("account.deliveryStep")}</li>
          <li aria-current="step"><ChevronRightIcon /><KeyIcon />{m.text("account.codeStep")}</li>
        </AccountSteps>}
        <AccountNote role={requested ? "status" : undefined}>{m.text(requested ? "account.resetSent" : "account.existingCode", { suffix: (canonicalPhone ?? phone).slice(-3) })}</AccountNote>
        <MemberForm method="post" action={`/api/account/${recovery ? "reset-code" : "verify"}`} onSubmit={verify}
          data-account-step-form="code" data-analytics-ignore aria-busy={busy === "verify"}>
          <AccountCodeField><TextInput ref={codeInput} name="code" label={m.text("account.verificationCode")} value={code}
            onChange={event => {
              const value = event.currentTarget.value;
              if (/^[0-9]{0,6}$/u.test(value)) updateCode(value);
              else { codeRevision.current++; setInvalidCode(true); setError(""); }
            }}
            onPaste={event => { event.preventDefault(); if (!busy) pasteCode(event.clipboardData.getData("text"), true); }}
            onClick={event => { if (event.isTrusted && event.button === 0) void readCopiedCode(event.currentTarget); }}
            autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} required disabled={!!busy} data-analytics-ignore data-validated-code
            error={invalidCode ? <span role="alert">{m.text("account.invalidCode")}</span> : undefined} /></AccountCodeField>
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={!!busy || code.length !== 6 || invalidCode}>{m.text(recovery ? "account.continueReset" : "account.verifyCode")}<ChevronRightIcon /></AccountPrimary>
        </MemberForm>
      </>}
      <AccountSecondaryActions aria-label={m.text("account.formActions")} data-account-secondary-actions>
        {recovery ? <AccountTextButton type="button" variant="quiet" disabled={!!busy || step === "delivery" && !canonicalPhone}
          onClick={() => changeStep(step === "delivery" ? "code" : "delivery")}>
          {m.text(step === "delivery" ? "account.alreadyHaveCode" : "account.changeCodeDeliveryNumber")}
        </AccountTextButton> : <AccountLink href={memberAuthPath("forgot", returnTo)} prefetch={false}>{m.text("account.forgotPassword")}</AccountLink>}
        {hasRestrictedSession ? <MemberSignOut logoutAction="/api/account/sign-out?destination=login" disabled={!!busy} variant="quiet">{m.text("auth.backToSignIn")}</MemberSignOut>
          : <AccountLink href={loginHref} prefetch={false}>{m.text("auth.backToSignIn")}</AccountLink>}
      </AccountSecondaryActions>
      <AccountFormSupport locale={locale} contact={contact} />
    </AccountCardBody>
  </AccountCard>;
}

export function AccountVerificationForm(props: { locale: string; phone: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="account" />;
}

export function ForgotPasswordForm(props: { locale: string; phone?: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="password-reset" />;
}
