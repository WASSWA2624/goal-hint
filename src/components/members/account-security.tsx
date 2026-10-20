"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import styled from "styled-components";
import { Button, PhoneInput, TextInput } from "@/components/ui/controls";
import { CheckIcon, ChevronLeftIcon, Icon, LockIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { formatPhone } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { MemberForm } from "./member-controls";
import { AccountActions, AccountError, AccountNote, AccountPhone, AccountPrimary, AccountTextButton } from "./account-styles";

export type VerificationPurpose = "phone" | "password" | "register" | "reset" | "login";
export type VerificationChannel = "whatsapp" | "sms";
export type VerificationChallenge = { challengeId: string; expiresAt: string; resendAt: string; channel: VerificationChannel };
export type VerificationProof = { verificationToken: string; expiresAt: string };

const DeliveryOptions = styled.fieldset`
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-inline-size: 0; margin: 0; padding: 0; border: 0;
  legend { padding: 0 0 6px; font-size: 0.8125rem; }
  label { display: flex; align-items: center; justify-content: center; gap: 7px; min-block-size: 40px;
    padding: 6px 8px; border: 1px solid ${({ theme }) => theme.color.controlBorder}; cursor: pointer; }
  label:has(input:checked) { border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.surfaceMuted}; }
  label:has(input:focus-visible) { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  input { inline-size: 16px; block-size: 16px; min-block-size: 0; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; }
`;

/** Native radios keep delivery selection explicit and consistent across every verification flow. */
export function VerificationDelivery({ locale, value, onChange, disabled = false }: {
  locale: string; value: VerificationChannel; onChange: (value: VerificationChannel) => void; disabled?: boolean;
}) {
  const m = createMessages(locale), name = useId();
  return <DeliveryOptions disabled={disabled} data-verification-delivery>
    <legend>{m.text("account.sendCodeBy")}</legend>
    {(["whatsapp", "sms"] as const).map(channel => <label key={channel}>
      <input type="radio" name={name} value={channel} checked={value === channel} onChange={() => onChange(channel)} />
      {m.text(channel === "whatsapp" ? "account.whatsapp" : "account.sms")}
    </label>)}
  </DeliveryOptions>;
}

/** Private request data stays in the request body and in component memory only. */
export async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/account/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Unable to complete this request. Please try again.");
  return result;
}

function useRemaining(expiresAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : 0;
}
const remainingLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const PasswordWrap = styled.div`
  position: relative; min-inline-size: 0;
  input { padding-inline-end: 48px; }
  > button { position: absolute; inset-inline-end: 1px; inset-block-end: 1px; inline-size: 44px; padding: 8px; min-block-size: 42px; }
`;
export function PasswordInput({ label, name = "password", value, onChange, current = false, hint }: {
  label: string; name?: string; value: string; onChange: (value: string) => void; current?: boolean; hint?: string;
}) {
  const [visible, setVisible] = useState(false), id = useId(), m = createMessages();
  return <div><PasswordWrap><TextInput id={id} label={label} name={name} value={value} required minLength={current ? undefined : 8} maxLength={128}
    type={visible ? "text" : "password"} autoComplete={current ? "current-password" : "new-password"}
    onChange={event => onChange(event.currentTarget.value)} data-analytics-ignore />
    <Button variant="quiet" aria-label={m.text(visible ? "account.hidePassword" : "account.showPassword")} aria-controls={id}
      onClick={() => setVisible(!visible)}><Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</Icon></Button>
  </PasswordWrap>{hint && <AccountNote>{hint}</AccountNote>}</div>;
}

/** Shared verification steps for registration, login, recovery, and either account change. */
export function VerificationForm({ locale, purpose, phone, initialChallenge, onVerified, onBack }: {
  locale: string; purpose: VerificationPurpose; phone: string; initialChallenge?: VerificationChallenge | undefined;
  onVerified: (proof: VerificationProof) => void | Promise<void>; onBack: () => void;
}) {
  const m = createMessages(locale), [challenge, setChallenge] = useState(initialChallenge), [code, setCode] = useState("");
  const [channel, setChannel] = useState<VerificationChannel>(initialChallenge?.channel ?? "whatsapp");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const seconds = useRemaining(challenge?.expiresAt), resend = useRemaining(challenge?.resendAt);
  async function send() {
    setBusy(true); setError("");
    try { setChallenge(await accountRequest<VerificationChallenge>("verification", { purpose, channel, ...(["register", "reset", "login"].includes(purpose) ? { phone } : {}) })); setCode(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!challenge || seconds <= 0 || busy) return;
    setBusy(true); setError("");
    try { await onVerified(await accountRequest<VerificationProof>("verification/confirm", { challengeId: challenge.challengeId, code })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); }
    finally { setBusy(false); }
  }
  return <MemberForm method="post" action="/api/account/verification/confirm" onSubmit={verify} data-analytics-ignore aria-busy={busy}>
    <p>{m.text(challenge ? challenge.channel === "sms" ? "account.smsSent" : "account.whatsappSent" : "account.codeDestination")}</p>
    <AccountPhone><PhoneIcon /><div><small>{m.text(["phone", "password", "reset"].includes(purpose) ? "account.registeredNumber" : "account.phoneNumber")}</small><strong>+{formatPhone(phone)}</strong></div></AccountPhone>
    <VerificationDelivery locale={locale} value={channel} onChange={setChannel} disabled={busy} />
    {channel === "whatsapp" && <AccountNote>{m.text("account.whatsappRequired")}</AccountNote>}
    {!challenge ? <>
      {purpose === "password" && <AccountNote>{m.text("account.noOldPassword")}</AccountNote>}
      <AccountNote>{m.text("account.fiveMinutes")}</AccountNote>
      <AccountPrimary onClick={send} disabled={busy}>{m.text(busy ? "account.working" : "account.sendCode")}</AccountPrimary>
    </> : <>
      <TextInput name="verificationCode" label={m.text("account.verificationCode")} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
        value={code} onChange={event => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} minLength={6} maxLength={6} required disabled={busy || seconds <= 0} />
      <AccountNote>{seconds > 0 ? m.text("account.expiresIn", { time: remainingLabel(seconds) }) : m.text("account.verificationExpired")}</AccountNote>
      <AccountPrimary type="submit" disabled={busy || seconds <= 0}>{m.text(busy ? "account.working" : "account.verifyCode")}</AccountPrimary>
      <AccountActions><AccountNote>{m.text("account.fiveMinutes")}</AccountNote>
        <AccountTextButton variant="quiet" onClick={send} disabled={busy || resend > 0}>{resend > 0 ? m.text("account.resendIn", { seconds: String(resend) }) : channel !== challenge.channel ? m.text("account.sendVia", { channel: channel === "sms" ? "SMS" : "WhatsApp" }) : m.text("account.resendCode")}</AccountTextButton>
      </AccountActions>
    </>}
    {error && <AccountError role="alert">{error}</AccountError>}
    <AccountTextButton variant="quiet" onClick={onBack} disabled={busy}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>
  </MemberForm>;
}

export function NewPasswordFields({ locale, password, setPassword, confirm, setConfirm }: {
  locale: string; password: string; setPassword: (value: string) => void; confirm: string; setConfirm: (value: string) => void;
}) {
  const m = createMessages(locale);
  return <><PasswordInput label={m.text("account.newPassword")} value={password} onChange={setPassword} hint={m.text("account.passwordHint")} />
    <PasswordInput name="confirm" label={m.text("account.confirmPassword")} value={confirm} onChange={setConfirm} /></>;
}

export function ProofExpiry({ locale, proof, onRestart }: { locale: string; proof: VerificationProof; onRestart: () => void }) {
  const m = createMessages(locale), seconds = useRemaining(proof.expiresAt);
  return <AccountActions><AccountNote>{seconds > 0 ? m.text("account.expiresIn", { time: remainingLabel(seconds) }) : m.text("account.verificationExpired")}</AccountNote>
    {seconds <= 0 && <AccountTextButton variant="quiet" onClick={onRestart}>{m.text("account.requestNewCode")}</AccountTextButton>}</AccountActions>;
}

const Identity = styled.div`
  display: flex; gap: 10px; align-items: center; padding-block-end: 16px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > svg { box-sizing: content-box; padding: 10px; inline-size: 20px; block-size: 20px; color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.surfaceMuted}; }
  strong { font-weight: 500; }
`;
const Setting = styled.div`
  display: flex; align-items: center; gap: 10px; min-inline-size: 0;
  padding-block: 14px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > div { flex: 1; min-inline-size: 0; }
  > svg { color: ${({ theme }) => theme.color.mutedText}; flex: none; }
  small { display: block; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; }
  > button { flex: none; padding: 7px 8px; font-weight: 400; color: ${({ theme }) => theme.color.link}; }
  @media(max-width: 380px) { > svg { display: none; } }
`;

export function AccountSettings({ phone, locale }: { phone: string; locale: string }) {
  const m = createMessages(locale), [task, setTask] = useState<"phone" | "password" | null>(null), [proof, setProof] = useState<VerificationProof>();
  const [newPhone, setNewPhone] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reset = () => { setProof(undefined); setPassword(""); setConfirm(""); setError(""); };
  const back = () => { reset(); setTask(null); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!task || !proof || busy) return;
    if (task === "password" && password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string }>(task, { verificationToken: proof.verificationToken, ...(task === "phone" ? { phone: newPhone } : { password }) });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  if (!task) return <div>
    <Identity><UserIcon /><div><strong>{m.text("account.yourAccount")}</strong><AccountNote>{m.text("account.phoneAndPassword")}</AccountNote></div></Identity>
    <Setting><PhoneIcon /><div>{m.text("account.phoneNumber")}<small>+{formatPhone(phone)}</small></div><Button variant="secondary" onClick={() => setTask("phone")}>{m.text("account.changePhone")}</Button></Setting>
    <Setting><LockIcon /><div>{m.text("account.password")}<small>{m.text("account.verifyWithPhone")}</small></div><Button variant="secondary" onClick={() => setTask("password")}>{m.text("account.changePassword")}</Button></Setting>
  </div>;
  if (!proof) return <div><h2>{m.text(task === "phone" ? "account.changePhone" : "account.changePassword")}</h2>
    <VerificationForm key={task} locale={locale} purpose={task} phone={phone} onVerified={setProof} onBack={back} /></div>;
  return <MemberForm method="post" action={`/api/account/${task}`} onSubmit={save} data-analytics-ignore aria-busy={busy}>
    <p><CheckIcon /> {m.text("account.phoneVerified")}</p>
    {task === "phone" ? <PhoneInput name="phone" label={m.text("account.newPhone")} value={newPhone} onValueChange={setNewPhone} required />
      : <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />}
    <ProofExpiry locale={locale} proof={proof} onRestart={reset} />
    {error && <AccountError role="alert">{error}</AccountError>}
    <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : task === "phone" ? "account.savePhone" : "account.savePassword")}</AccountPrimary>
    <AccountTextButton variant="quiet" onClick={back} disabled={busy}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>
  </MemberForm>;
}
