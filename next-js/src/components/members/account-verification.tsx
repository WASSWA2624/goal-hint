"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SegmentedChoice, TextInput, TextLink } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChevronRightIcon, KeyIcon, LockIcon, MailIcon } from "@/components/ui/icons";
import { messageChannels, supportedMessageChannels, type MessageChannel } from "@/domain/member-verification";
import { normalizePhone } from "@/domain/phone";
import { parseVerificationCode } from "@/domain/verification-code";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountSupportLink, type AdminContact } from "./admin-contact";
import { accountRequest } from "./account-security";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountCodeField, AccountError, AccountNote, AccountPrimary,
  AccountSteps, AccountSupport, AccountTextButton } from "./account-styles";
import { MemberForm, MemberSignOut } from "./member-controls";
import { FreeTrialNotice, type FreeTrialAccess } from "./free-trial-notice";

type CodeFormProps = { locale: string; returnTo: string | null; contact: AdminContact } & (
  { purpose: "account"; phone: string } | { purpose: "password-reset"; phone?: never }
);

/** Both verification flows keep codes in component memory and submit only after an explicit confirmation. */
function AccountCodeForm({ locale, returnTo, contact, ...flow }: CodeFormProps) {
  const m = createMessages(locale), [phone, setPhone] = useState(flow.phone ?? "256");
  const [channel, setChannel] = useState<MessageChannel | "">("sms"), [code, setCode] = useState("");
  const [step, setStep] = useState<"delivery" | "code">("delivery");
  const [requested, setRequested] = useState(false), [error, setError] = useState(""), [invalidCode, setInvalidCode] = useState(false);
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const [verifiedTrial, setVerifiedTrial] = useState<{ trial: FreeTrialAccess; next: string } | null>(null);
  const codeInput = useRef<HTMLInputElement>(null), codeRevision = useRef(0), clipboardPending = useRef(false);
  const recovery = flow.purpose === "password-reset", canonicalPhone = normalizePhone(phone);
  const channels = canonicalPhone ? supportedMessageChannels(canonicalPhone) : messageChannels;
  const selectedChannel = channel && channels.includes(channel) ? channel : channels.includes("sms") ? "sms" : channels[0] ?? "";
  const sendLabel = selectedChannel ? m.text("account.sendCodeBy", { channel: selectedChannel === "sms" ? "SMS" : "WhatsApp" }) : m.text("account.sendCode");
  const loginHref = `/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "login", ...(returnTo ? { return: returnTo } : {}) })}`;
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
    event.preventDefault(); if (busy || !canonicalPhone || !selectedChannel) return;
    setBusy("request"); setError("");
    try {
      await accountRequest(recovery ? "forgot" : "verification", { ...(recovery ? { phone } : {}), channel: selectedChannel, ...returnBody });
      setRequested(true); updateCode(""); setStep("code");
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(null); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !canonicalPhone) return;
    const parsed = parseVerificationCode(code);
    if (parsed === null || invalidCode) { setInvalidCode(true); return; }
    setBusy("verify"); setError("");
    try {
      const result = await accountRequest<{ next: string; trial?: FreeTrialAccess }>(recovery ? "reset-code" : "verify", { ...(recovery ? { phone } : {}), code: parsed, ...returnBody });
      if (!recovery && result.trial?.active) { setCode(""); setVerifiedTrial({ trial: result.trial, next: result.next }); return; }
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(null); }
  }
  if (verifiedTrial) return <FreeTrialNotice locale={locale} {...verifiedTrial} />;
  return <AccountCard data-account-auth data-account-verification={flow.purpose} data-verification-step={step} data-analytics-ignore>
    <AccountCardHeading><LockIcon /><h1>{m.text(step === "code" ? "account.enterCode" : recovery ? "account.resetPassword" : "account.verifyAccount")}</h1></AccountCardHeading>
    <AccountCardBody>
      {step === "delivery" ? <>
        <MemberForm method="post" action={`/api/account/${recovery ? "forgot" : "verification"}`} onSubmit={request}
          data-account-step-form="delivery" data-analytics-ignore aria-busy={busy === "request"}>
          {recovery && <PhoneInput name="phone" label={m.text("account.registeredNumber")} value={phone} onValueChange={changePhone} lookup required disabled={!!busy} hint="" />}
          {channels.length > 0 ? <SegmentedChoice<MessageChannel | ""> name="channel" label={m.text("account.deliveryChannel")} value={selectedChannel}
            options={channels.map(value => ({ value, label: value === "sms" ? "SMS" : "WhatsApp" }))} onValueChange={setChannel} disabled={!!busy} />
            : <AccountNote role="status">{m.text("account.countryUnsupported")}</AccountNote>}
          {selectedChannel === "whatsapp" && <AccountNote>{m.text("account.whatsappConsent")}</AccountNote>}
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={!!busy || !canonicalPhone || !selectedChannel}>{busy === "request" ? m.text("account.working") : sendLabel}<ChevronRightIcon /></AccountPrimary>
        </MemberForm>
        <AccountTextButton type="button" variant="quiet" disabled={!!busy || !canonicalPhone} onClick={() => changeStep("code")}>
          {m.text("account.alreadyHaveCode")}
        </AccountTextButton>
      </> : <>
        <AccountSteps aria-label={m.text("account.verificationSteps")}>
          <li><MailIcon />{m.text("account.deliveryStep")}</li>
          <li aria-current="step"><ChevronRightIcon /><KeyIcon />{m.text("account.codeStep")}</li>
        </AccountSteps>
        <p role={requested ? "status" : undefined}>{m.text(requested ? recovery ? "account.resetSent" : "account.verificationSent" : "account.existingCode", { suffix: (canonicalPhone ?? phone).slice(-3) })}</p>
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
          <AccountPrimary type="submit" disabled={!!busy || code.length !== 6 || invalidCode}>{m.text(busy === "verify" ? "account.working" : recovery ? "account.continueReset" : "account.verifyCode")}<ChevronRightIcon /></AccountPrimary>
        </MemberForm>
        <AccountTextButton type="button" variant="quiet" disabled={!!busy} onClick={() => changeStep("delivery")}>
          {m.text(recovery ? "account.changeCodeDeliveryNumber" : "account.changeCodeDelivery")}
        </AccountTextButton>
      </>}
      <AccountSupport aria-label={m.text("account.support")} data-account-support>
        <AccountSupportLink locale={locale} contact={contact} />
        {recovery ? <TextLink href={loginHref} prefetch={false}>{m.text("account.backToLogin")}</TextLink>
          : <MemberSignOut disabled={!!busy} variant="quiet">{m.text("account.backToLogin")}</MemberSignOut>}
      </AccountSupport>
    </AccountCardBody>
  </AccountCard>;
}

export function AccountVerificationForm(props: { locale: string; phone: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="account" />;
}

export function ForgotPasswordForm(props: { locale: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="password-reset" />;
}
