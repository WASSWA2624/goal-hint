"use client";

import { useState, type FormEvent } from "react";
import styled from "styled-components";
import { Button, PhoneInput, TextInput, TextLink } from "@/components/ui/controls";
import { ChevronLeftIcon, LockIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { passwordChangeWindowMs } from "@/domain/member-verification";
import { formatPhone } from "@/domain/phone";
import { resolveLocale } from "@/i18n/locales";
import { createMessages } from "@/i18n/messages";
import { AccountHelpLinks, type AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";
import { AccountError, AccountNote, AccountPrimary, AccountTextButton } from "./account-styles";

/** Private request data stays in the request body and in component memory only. */
export async function accountRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/account/${path}`, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Unable to complete this request. Please try again.");
  return result;
}

export function PasswordInput({ label, name = "password", value, onChange, current = false, hint }: {
  label: string; name?: string; value: string; onChange: (value: string) => void; current?: boolean; hint?: string;
}) {
  return <div><TextInput label={label} name={name} value={value} required minLength={current ? undefined : 8} maxLength={128}
    type="password" autoComplete={current ? "current-password" : "new-password"}
    onChange={event => onChange(event.currentTarget.value)} data-analytics-ignore />
    {hint && <AccountNote>{hint}</AccountNote>}</div>;
}

export function NewPasswordFields({ locale, password, setPassword, confirm, setConfirm }: {
  locale: string; password: string; setPassword: (value: string) => void; confirm: string; setConfirm: (value: string) => void;
}) {
  const m = createMessages(locale);
  return <><PasswordInput label={m.text("account.newPassword")} value={password} onChange={setPassword} hint={m.text("account.passwordHint")} />
    <PasswordInput name="confirm" label={m.text("account.confirmPassword")} value={confirm} onChange={setConfirm} /></>;
}

export function PasswordChangeNote({ locale }: { locale: string }) {
  return <AccountNote>{createMessages(locale).text("account.passwordChangeLimit", { hours: String(passwordChangeWindowMs / 3_600_000) })}</AccountNote>;
}

/** The reset cookie is deliberately not an authenticated member session. It authorizes this form alone. */
export function ResetPasswordForm({ locale, phone, returnTo = null, contact }: { locale: string; phone: string; returnTo?: string | null; contact: AdminContact }) {
  const m = createMessages(locale), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try { const result = await accountRequest<{ next: string }>("reset", { password, ...(returnTo ? { return: returnTo } : {}) }); location.replace(result.next); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  return <div data-analytics-ignore><h1>{m.text("account.chooseNewPassword")}</h1><p>{m.text("account.resetAccepted", { phone: formatPhone(phone) })}</p>
    <PasswordChangeNote locale={locale} />
    <MemberForm method="post" action="/api/account/reset" onSubmit={submit} aria-busy={busy}>
      <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
      {error && <AccountError role="alert">{error}</AccountError>}
      <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : "account.savePassword")}</AccountPrimary>
    </MemberForm><AccountHelpLinks locale={locale} contact={contact} /></div>;
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

/** Account changes require the current password; a new phone must also be verified. */
export function AccountSettings({ phone, locale, contact, returnTo = null }: { phone: string; locale: string; contact: AdminContact; returnTo?: string | null }) {
  const m = createMessages(locale), [task, setTask] = useState<"phone" | "password" | null>(null);
  const [newPhone, setNewPhone] = useState(""), [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const back = () => { setCurrent(""); setPassword(""); setConfirm(""); setError(""); setTask(null); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!task || busy) return;
    if (task === "password" && password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string }>(task, { currentPassword: current, ...(task === "phone" ? { phone: newPhone } : { password }) });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  if (!task) return <div>
    <Identity><UserIcon /><div><strong>{m.text("account.yourAccount")}</strong><AccountNote>{m.text("account.phoneAndPassword")}</AccountNote></div></Identity>
    <Setting><PhoneIcon /><div>{m.text("account.phoneNumber")}<small>+{formatPhone(phone)}</small></div><Button variant="secondary" onClick={() => setTask("phone")}>{m.text("account.changePhone")}</Button></Setting>
    <Setting><LockIcon /><div>{m.text("account.password")}<small>{m.text("account.passwordNote")}</small></div><Button variant="secondary" onClick={() => setTask("password")}>{m.text("account.changePassword")}</Button></Setting>
  </div>;
  const currentField = <PasswordInput name="currentPassword" label={m.text("account.currentPassword")} value={current} onChange={setCurrent} current />;
  return <div><h2>{m.text(task === "phone" ? "account.changePhone" : "account.changePassword")}</h2>
    <MemberForm method="post" action={`/api/account/${task}`} onSubmit={save} data-analytics-ignore aria-busy={busy}>
      {task === "phone" ? <><PhoneInput name="phone" label={m.text("account.newPhone")} value={newPhone} onValueChange={setNewPhone} required />{currentField}</>
        : <>{currentField}<NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} /></>}
      {task === "password" ? <PasswordChangeNote locale={locale} /> : <AccountNote>{m.text("account.newPhoneVerification")}</AccountNote>}
      <AccountNote><TextLink href={`/${resolveLocale(locale)}/account?${new URLSearchParams({ view: "forgot", ...(returnTo ? { return: returnTo } : {}) })}`} prefetch={false}>{m.text("account.forgotPassword")}</TextLink></AccountNote>
      {error && <AccountError role="alert">{error}</AccountError>}
      <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : task === "phone" ? "account.savePhone" : "account.savePassword")}</AccountPrimary>
      <AccountTextButton variant="quiet" onClick={back} disabled={busy}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>
    </MemberForm><AccountHelpLinks locale={locale} contact={contact} /></div>;
}
