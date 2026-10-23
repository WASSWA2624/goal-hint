"use client";

import { useState, type FormEvent } from "react";
import { PhoneInput, SegmentedChoice, TextInput, TextLink } from "@/components/ui/controls";
import { LockIcon, PhoneIcon } from "@/components/ui/icons";
import { messageChannels, supportedMessageChannels, verificationCodeLifetimeMs, verificationRequestLimit, verificationRequestWindowMs, type MessageChannel } from "@/domain/member-verification";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountHelpLinks, type AdminContact } from "./admin-contact";
import { accountRequest, PasswordChangeNote } from "./account-security";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPhone, AccountPrimary } from "./account-styles";
import { MemberForm, MemberSignOut } from "./member-controls";

type CodeFormProps = { locale: string; returnTo: string | null; contact: AdminContact } & (
  { purpose: "account"; phone: string } | { purpose: "password-reset"; phone?: never }
);

/** A shared code flow keeps both recovery and number verification consistent. No code is persisted by the browser. */
function AccountCodeForm({ locale, returnTo, contact, ...flow }: CodeFormProps) {
  const m = createMessages(locale), [phone, setPhone] = useState(flow.phone ?? "256");
  const [channel, setChannel] = useState<MessageChannel | "">(""), [code, setCode] = useState("");
  const [requested, setRequested] = useState(false), [error, setError] = useState("");
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const recovery = flow.purpose === "password-reset", canonicalPhone = normalizePhone(phone);
  const channels = canonicalPhone ? supportedMessageChannels(canonicalPhone) : messageChannels;
  const selectedChannel = channel && channels.includes(channel) ? channel : "";
  const loginHref = `/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "login", ...(returnTo ? { return: returnTo } : {}) })}`;
  const returnBody = returnTo ? { return: returnTo } : {};
  const changePhone = (value: string) => { setPhone(value); setChannel(""); setCode(""); setRequested(false); setError(""); };
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !selectedChannel) return;
    setBusy("request"); setError("");
    try {
      await accountRequest(recovery ? "forgot" : "verification", { ...(recovery ? { phone } : {}), channel: selectedChannel, ...returnBody });
      setRequested(true); setCode("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(null); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy("verify"); setError("");
    try {
      const result = await accountRequest<{ next: string }>(recovery ? "reset-code" : "verify", { ...(recovery ? { phone } : {}), code, ...returnBody });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(null); }
  }
  return <AccountCard data-account-auth data-account-verification={flow.purpose} data-analytics-ignore>
    <AccountCardHeading><LockIcon /><h1>{m.text(recovery ? "account.resetPassword" : "account.verifyAccount")}</h1></AccountCardHeading>
    <AccountCardBody>
      <p>{m.text(recovery ? "account.resetHelp" : "account.verificationHelp")}</p>
      {!recovery && <AccountPhone><PhoneIcon /><div><small>{m.text("account.registeredNumber")}</small><strong>+{formatPhone(phone)}</strong></div></AccountPhone>}
      <AccountNote>{m.text("account.codeRules", { hours: String(verificationCodeLifetimeMs / 3_600_000), limit: String(verificationRequestLimit), window: String(verificationRequestWindowMs / 3_600_000) })}</AccountNote>
      <MemberForm method="post" action={`/api/account/${recovery ? "forgot" : "verification"}`} onSubmit={request} data-analytics-ignore aria-busy={busy === "request"}>
        {recovery && <PhoneInput name="phone" label={m.text("account.registeredNumber")} value={phone} onValueChange={changePhone} required disabled={!!busy} />}
        {channels.length > 0 ? <SegmentedChoice<MessageChannel | ""> name="channel" label={m.text("account.deliveryChannel")} value={selectedChannel}
          options={channels.map(value => ({ value, label: value === "sms" ? "SMS" : "WhatsApp" }))} onValueChange={setChannel} disabled={!!busy} />
          : <AccountNote>{m.text("account.countryUnsupported")}</AccountNote>}
        {selectedChannel === "whatsapp" && <AccountNote>{m.text("account.whatsappConsent")}</AccountNote>}
        <AccountPrimary type="submit" disabled={!!busy || !selectedChannel}>{m.text(busy === "request" ? "account.working" : requested ? "account.resendCode" : "account.sendCode")}</AccountPrimary>
      </MemberForm>
      {requested && <p role="status">{m.text(recovery ? "account.resetSent" : "account.verificationSent")}</p>}
      {(!recovery || canonicalPhone) && <MemberForm method="post" action={`/api/account/${recovery ? "reset-code" : "verify"}`} onSubmit={verify} data-analytics-ignore aria-busy={busy === "verify"}>
        {recovery && !requested && <AccountNote>{m.text("account.existingCode")}</AccountNote>}
        <TextInput name="code" label={m.text("account.verificationCode")} value={code} onChange={event => setCode(event.currentTarget.value)}
          autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={!!busy} data-analytics-ignore
          hint={m.text("account.codeHint")} />
        <AccountPrimary type="submit" disabled={!!busy}>{m.text(busy === "verify" ? "account.working" : recovery ? "account.continueReset" : "account.verifyAccount")}</AccountPrimary>
      </MemberForm>}
      {error && <AccountError role="alert">{error}</AccountError>}
      {recovery && <PasswordChangeNote locale={locale} />}
      <AccountHelpLinks locale={locale} contact={contact} />
      {recovery ? <TextLink href={loginHref} prefetch={false}>{m.text("account.backToLogin")}</TextLink>
        : <><TextLink href={`/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "forgot", ...(returnTo ? { return: returnTo } : {}) })}`} prefetch={false}>{m.text("account.forgotPassword")}</TextLink>
          <MemberSignOut>{m.text("account.backToLogin")}</MemberSignOut></>}
    </AccountCardBody>
  </AccountCard>;
}

export function AccountVerificationForm(props: { locale: string; phone: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="account" />;
}

export function ForgotPasswordForm(props: { locale: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="password-reset" />;
}
