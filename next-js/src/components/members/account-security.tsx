"use client";

import { useState, type FormEvent } from "react";
import styled from "styled-components";
import { TextInput } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { passwordChangeWindowMs } from "@/domain/member-verification";
import { memberAuthReturnFields } from "@/domain/member-navigation";
import { formatPhone } from "@/domain/phone";
import { createMessages } from "@/i18n/messages";
import { AccountFormSupport, type AdminContact } from "./admin-contact";
import { AccountFormHeader } from "./account-form-header";
import { LockIcon } from "@/components/ui/icons";
import { MemberForm } from "./member-controls";
import { accountRequest } from "./account-request";
import { AccountActions, AccountCard, AccountCardBody, AccountError, AccountFormColumn, AccountLink, AccountNote, AccountPrimary } from "./account-styles";
import { media } from "@/styles/theme";

export { accountRequest } from "./account-request";

export function PasswordInput({ label, name = "password", value, onChange, current = false, requireMinimumLength = !current, hint, disabled = false, placeholder }: {
  label: string; name?: string; value: string; onChange: (value: string) => void; current?: boolean; requireMinimumLength?: boolean;
  hint?: string; disabled?: boolean; placeholder?: string;
}) {
  return <div><TextInput label={label} name={name} value={value} required minLength={requireMinimumLength ? 8 : undefined} maxLength={128}
    type="password" autoComplete={current ? "current-password" : "new-password"} disabled={disabled} placeholder={placeholder}
    onChange={event => onChange(event.currentTarget.value)} data-analytics-ignore />
    {hint && <AccountNote>{hint}</AccountNote>}</div>;
}

export function NewPasswordFields({ locale, password, setPassword, confirm, setConfirm, reset = false, requireMinimumLength = reset, disabled = false }: {
  locale: string; password: string; setPassword: (value: string) => void; confirm: string; setConfirm: (value: string) => void;
  reset?: boolean; requireMinimumLength?: boolean; disabled?: boolean;
}) {
  const m = createMessages(locale);
  return <><PasswordInput label={m.text("account.newPassword")} value={password} onChange={setPassword} disabled={disabled}
    requireMinimumLength={requireMinimumLength} {...(requireMinimumLength ? { hint: m.text("account.passwordHint") } : {})} />
    <PasswordInput name="confirm" label={m.text(reset ? "account.confirmPassword" : "account.repeatPassword")} value={confirm} onChange={setConfirm}
      disabled={disabled} requireMinimumLength={requireMinimumLength} /></>;
}

export function PasswordChangeNote({ locale }: { locale: string }) {
  return <AccountNote>{createMessages(locale).text("account.passwordChangeLimit", { hours: String(passwordChangeWindowMs / 3_600_000) })}</AccountNote>;
}

/** The reset cookie is deliberately not an authenticated member session. It authorizes this form alone. */
export function ResetPasswordForm({ locale, phone, returnTo = null, checkout = false, contact }: {
  locale: string; phone: string; returnTo?: string | null; checkout?: boolean; contact: AdminContact;
}) {
  const m = createMessages(locale), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try { const result = await accountRequest<{ next: string }>("reset", { password, ...memberAuthReturnFields(returnTo, checkout) }); location.replace(result.next); }
    catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  return <AccountCard data-account-auth data-account-reset data-analytics-ignore>
    <AccountFormHeader icon={LockIcon} title={m.text("account.chooseNewPassword")}
      description={m.text("account.resetAccepted", { phone: formatPhone(phone) })} />
    <AccountCardBody>
      <PasswordChangeNote locale={locale} />
      <MemberForm method="post" action="/api/account/reset" onSubmit={submit} aria-busy={busy}>
        <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} reset />
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy}>{m.text("account.savePassword")}</AccountPrimary>
      </MemberForm><AccountFormSupport locale={locale} contact={contact} />
    </AccountCardBody></AccountCard>;
}

const TaskForm = styled(AccountFormColumn)`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  input { font-size: var(--gh-font-section); }
`;
const FormActions = styled(AccountActions)`
  justify-content: flex-start;
  ${media.desktop} { > button { inline-size: auto; } }
`;

/**
 * Password changes use the authenticated session; phone changes still require the current password and verification.
 */
export function AccountSecurityForm({ task, locale, contact, cancelHref }: {
  task: "phone" | "password"; locale: string; contact: AdminContact; cancelHref: string;
}) {
  const m = createMessages(locale);
  const [newPhone, setNewPhone] = useState(""), [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (task === "password" && password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string }>(task, task === "phone" ? { currentPassword: current, phone: newPhone } : { password, confirm });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  const currentField = <PasswordInput name="currentPassword" label={m.text("account.currentPassword")} value={current} onChange={setCurrent} current />;
  return <TaskForm data-account-sign-in>
    <MemberForm method="post" action={`/api/account/${task}`} onSubmit={save} data-analytics-ignore aria-busy={busy}>
      {task === "phone" ? <><PhoneInput name="phone" label={m.text("account.newPhone")} value={newPhone} onValueChange={setNewPhone} required />{currentField}</>
        : <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} disabled={busy} />}
      {task === "password" ? <PasswordChangeNote locale={locale} /> : <AccountNote>{m.text("account.newPhoneHelp")}</AccountNote>}
      {error && <AccountError role="alert">{error}</AccountError>}
      <FormActions>
        <AccountPrimary type="submit" disabled={busy}>{m.text(task === "phone" ? "account.savePhone" : "account.savePassword")}</AccountPrimary>
        <AccountLink href={cancelHref} prefetch={false}>{m.text("account.cancelLabel")}</AccountLink>
      </FormActions>
    </MemberForm><AccountFormSupport locale={locale} contact={contact} /></TaskForm>;
}
