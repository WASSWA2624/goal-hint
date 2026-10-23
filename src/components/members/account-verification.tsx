"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PhoneInput, SegmentedChoice, TextInput, TextLink } from "@/components/ui/controls";
import { ChevronDownIcon, ChevronLeftIcon, LockIcon, PhoneIcon } from "@/components/ui/icons";
import { messageChannels, supportedMessageChannels, verificationCodeLifetimeMs, verificationRequestLimit, verificationRequestWindowMs, type MessageChannel } from "@/domain/member-verification";
import { formatPhone, normalizePhone } from "@/domain/phone";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountHelpLinks, type AdminContact } from "./admin-contact";
import { accountRequest, PasswordChangeNote } from "./account-security";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPhone, AccountPrimary,
  AccountSection, AccountSteps, AccountTextButton } from "./account-styles";
import { MemberForm, MemberSignOut } from "./member-controls";

type CodeFormProps = { locale: string; returnTo: string | null; contact: AdminContact } & (
  { purpose: "account"; phone: string } | { purpose: "password-reset"; phone?: never }
);

/** A shared code flow keeps both recovery and number verification consistent. No code is persisted by the browser. */
function AccountCodeForm({ locale, returnTo, contact, ...flow }: CodeFormProps) {
  const m = createMessages(locale), [phone, setPhone] = useState(flow.phone ?? "256");
  const [channel, setChannel] = useState<MessageChannel | "">(""), [code, setCode] = useState("");
  const [step, setStep] = useState<"delivery" | "code">("delivery");
  const [requested, setRequested] = useState(false), [error, setError] = useState("");
  const [busy, setBusy] = useState<"request" | "verify" | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const recovery = flow.purpose === "password-reset", canonicalPhone = normalizePhone(phone);
  const channels = canonicalPhone ? supportedMessageChannels(canonicalPhone) : messageChannels;
  const selectedChannel = channel && channels.includes(channel) ? channel : "";
  const loginHref = `/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "login", ...(returnTo ? { return: returnTo } : {}) })}`;
  const returnBody = returnTo ? { return: returnTo } : {};
  const changePhone = (value: string) => { setPhone(value); setChannel(""); setCode(""); setRequested(false); setError(""); };
  const changeStep = (next: "delivery" | "code") => {
    if (busy || next === "code" && !canonicalPhone) return;
    setCode(""); setError(""); setStep(next);
  };
  useEffect(() => { if (step === "code") codeInput.current?.focus(); }, [step]);
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !canonicalPhone || !selectedChannel) return;
    setBusy("request"); setError("");
    try {
      await accountRequest(recovery ? "forgot" : "verification", { ...(recovery ? { phone } : {}), channel: selectedChannel, ...returnBody });
      setRequested(true); setCode(""); setStep("code");
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(null); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !canonicalPhone || !/^[0-9]{6}$/u.test(code)) return;
    setBusy("verify"); setError("");
    try {
      const result = await accountRequest<{ next: string }>(recovery ? "reset-code" : "verify", { ...(recovery ? { phone } : {}), code, ...returnBody });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(null); }
  }
  return <AccountCard data-account-auth data-account-verification={flow.purpose} data-verification-step={step} data-analytics-ignore>
    <AccountCardHeading><LockIcon /><h1>{m.text(step === "code" ? "account.enterCode" : recovery ? "account.resetPassword" : "account.verifyAccount")}</h1></AccountCardHeading>
    <AccountCardBody>
      <AccountSteps aria-label={m.text("account.verificationSteps")}>
        <li aria-current={step === "delivery" ? "step" : undefined}><span aria-hidden="true">1</span>{m.text("account.deliveryStep")}</li>
        <li aria-current={step === "code" ? "step" : undefined}><span aria-hidden="true">2</span>{m.text("account.codeStep")}</li>
      </AccountSteps>
      {step === "delivery" ? <>
        <p>{m.text(recovery ? "account.resetHelp" : "account.verificationHelp")}</p>
        {!recovery && <AccountPhone><PhoneIcon /><div><small>{m.text("account.registeredNumber")}</small><strong>+{formatPhone(phone)}</strong></div></AccountPhone>}
        <MemberForm method="post" action={`/api/account/${recovery ? "forgot" : "verification"}`} onSubmit={request}
          data-account-step-form="delivery" data-analytics-ignore aria-busy={busy === "request"}>
          {recovery && <PhoneInput name="phone" label={m.text("account.registeredNumber")} value={phone} onValueChange={changePhone} required disabled={!!busy} />}
          {channels.length > 0 ? <SegmentedChoice<MessageChannel | ""> name="channel" label={m.text("account.deliveryChannel")} value={selectedChannel}
            options={channels.map(value => ({ value, label: value === "sms" ? "SMS" : "WhatsApp" }))} onValueChange={setChannel} disabled={!!busy} />
            : <AccountNote role="status">{m.text("account.countryUnsupported")}</AccountNote>}
          {selectedChannel === "whatsapp" && <AccountNote>{m.text("account.whatsappConsent")}</AccountNote>}
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={!!busy || !canonicalPhone || !selectedChannel}>{m.text(busy === "request" ? "account.working" : "account.sendCode")}</AccountPrimary>
        </MemberForm>
        <AccountTextButton type="button" variant="quiet" disabled={!!busy || !canonicalPhone} onClick={() => changeStep("code")}>
          {m.text("account.alreadyHaveCode")}
        </AccountTextButton>
      </> : <>
        <p role={requested ? "status" : undefined}>{m.text(requested ? recovery ? "account.resetSent" : "account.verificationSent" : "account.existingCode")}</p>
        <AccountPhone><PhoneIcon /><div><small>{m.text("account.registeredNumber")}</small><strong>+{formatPhone(canonicalPhone ?? phone)}</strong></div></AccountPhone>
        <MemberForm method="post" action={`/api/account/${recovery ? "reset-code" : "verify"}`} onSubmit={verify}
          data-account-step-form="code" data-analytics-ignore aria-busy={busy === "verify"}>
          <TextInput ref={codeInput} name="code" label={m.text("account.verificationCode")} value={code}
            onChange={event => setCode(event.currentTarget.value.replace(/[^0-9]/gu, "").slice(0, 6))}
            autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required disabled={!!busy} data-analytics-ignore
            hint={m.text("account.codeHint")} />
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={!!busy}>{m.text(busy === "verify" ? "account.working" : recovery ? "account.continueReset" : "account.verifyAccount")}</AccountPrimary>
        </MemberForm>
        <AccountTextButton type="button" variant="quiet" disabled={!!busy} onClick={() => changeStep("delivery")}>
          <ChevronLeftIcon />{m.text(recovery ? "account.changeCodeDeliveryNumber" : "account.changeCodeDelivery")}
        </AccountTextButton>
      </>}
      <AccountSection data-verification-help>
        <summary>{m.text("account.needHelp")}<ChevronDownIcon /></summary>
        <div>
          <AccountNote>{m.text("account.codeRules", { hours: String(verificationCodeLifetimeMs / 3_600_000), limit: String(verificationRequestLimit), window: String(verificationRequestWindowMs / 3_600_000) })}</AccountNote>
          {recovery && <PasswordChangeNote locale={locale} />}
          <AccountHelpLinks locale={locale} contact={contact} />
          {recovery ? <TextLink href={loginHref} prefetch={false}>{m.text("account.backToLogin")}</TextLink>
            : <><TextLink href={`/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "forgot", ...(returnTo ? { return: returnTo } : {}) })}`} prefetch={false}>{m.text("account.forgotPassword")}</TextLink>
              <MemberSignOut disabled={!!busy}>{m.text("account.backToLogin")}</MemberSignOut></>}
        </div>
      </AccountSection>
    </AccountCardBody>
  </AccountCard>;
}

export function AccountVerificationForm(props: { locale: string; phone: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="account" />;
}

export function ForgotPasswordForm(props: { locale: string; returnTo: string | null; contact: AdminContact }) {
  return <AccountCodeForm {...props} purpose="password-reset" />;
}
