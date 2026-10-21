"use client";

import { useId, useState, type FormEvent } from "react";
import styled from "styled-components";
import { Button, PhoneInput, TextInput, TextLink } from "@/components/ui/controls";
import { ChevronLeftIcon, Icon, LockIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import { formatPhone, telHref } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import type { AdminContact } from "./admin-contact";
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

export function NewPasswordFields({ locale, password, setPassword, confirm, setConfirm }: {
  locale: string; password: string; setPassword: (value: string) => void; confirm: string; setConfirm: (value: string) => void;
}) {
  const m = createMessages(locale);
  return <><PasswordInput label={m.text("account.newPassword")} value={password} onChange={setPassword} hint={m.text("account.passwordHint")} />
    <PasswordInput name="confirm" label={m.text("account.confirmPassword")} value={confirm} onChange={setConfirm} /></>;
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

/** Either change needs the current password and nothing else; a forgotten one is reset by the admin on a call. */
export function AccountSettings({ phone, locale, contact }: { phone: string; locale: string; contact: AdminContact }) {
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
      {contact.contactPhone && <AccountNote>{m.text("account.forgotCurrent")} <TextLink href={telHref(contact.contactPhone)} data-analytics-ignore>{m.text("subscribe.callAdmin")}</TextLink></AccountNote>}
      {error && <AccountError role="alert">{error}</AccountError>}
      <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : task === "phone" ? "account.savePhone" : "account.savePassword")}</AccountPrimary>
      <AccountTextButton variant="quiet" onClick={back} disabled={busy}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>
    </MemberForm></div>;
}
