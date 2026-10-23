"use client";

import { useState, type FormEvent } from "react";
import { PhoneInput, TextLink } from "@/components/ui/controls";
import { UserIcon } from "@/components/ui/icons";
import { Notice } from "@/components/analytics/dashboard/dashboard-styles";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import type { AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";
import { AccountActions, AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPrimary } from "./account-styles";
import { accountRequest, PasswordInput } from "./account-security";
import { ForgotPasswordForm } from "./account-verification";
import { saveMemberLoginFlash } from "./member-login-flash";

export type AccountAuthView = "login" | "register" | "forgot";

/** Registration creates a pending account; a delivered code establishes ownership of its number. */
export function AccountAuthForm({ locale, view = "login", returnTo, contact }: { locale: string; view?: AccountAuthView; returnTo: string | null; contact: AdminContact }) {
  const m = createMessages(locale), [phone, setPhone] = useState("256");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<{ next: string; otherDeviceSignedOut: boolean } | null>(null);
  const base = `/${resolveLocale(locale)}`;
  const href = (next: AccountAuthView) => `${base}/account?${new URLSearchParams({ view: next, ...(returnTo ? { return: returnTo } : {}) })}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string; otherDeviceSignedOut?: boolean }>(view, { phone, password, ...(returnTo ? { return: returnTo } : {}) });
      if (view === "login" && typeof result.otherDeviceSignedOut === "boolean" && !saveMemberLoginFlash(result.otherDeviceSignedOut)) {
        setPassword(""); setCompleted({ next: result.next, otherDeviceSignedOut: result.otherDeviceSignedOut }); setBusy(false); return;
      }
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  if (view === "forgot") return <ForgotPasswordForm locale={locale} returnTo={returnTo} contact={contact} />;
  if (completed) return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading><UserIcon /><h1>{m.text("account.loginSuccessful")}</h1></AccountCardHeading>
    <AccountCardBody>
      <Notice role="status">{m.text(completed.otherDeviceSignedOut ? "account.otherDeviceSignedOut" : "account.loginSuccessful")}</Notice>
      <AccountPrimary type="button" onClick={() => location.replace(completed.next)}>{m.text("account.continue")}</AccountPrimary>
    </AccountCardBody>
  </AccountCard>;
  return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading><UserIcon /><h1>{m.text(view === "register" ? "account.register" : "account.login")}</h1></AccountCardHeading>
    <AccountCardBody>
      <MemberForm method="post" action={`/api/account/${view}`} onSubmit={submit} data-analytics-ignore aria-busy={busy}
        aria-describedby={view === "login" ? "account-single-device-notice" : undefined}>
        <PhoneInput name="phone" label={m.text("account.phoneNumber")} value={phone} onValueChange={setPhone} required disabled={busy} />
        <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current={view === "login"}
          {...(view === "register" ? { hint: m.text("account.passwordHint") } : {})} />
        {view === "login" && <TextLink href={href("forgot")} prefetch={false}>{m.text("account.forgotPassword")}</TextLink>}
        {view === "register" && <AccountNote>{m.text("account.registerHelp")}</AccountNote>}
        {error && <AccountError role="alert">{error}</AccountError>}
        {view === "login" && <Notice id="account-single-device-notice" $tone="warning" role="note">{m.text("account.singleDeviceNotice")}</Notice>}
        <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : view === "login" ? "account.login" : "account.createAccount")}</AccountPrimary>
      </MemberForm>
      <AccountActions><AccountNote>{m.text(view === "login" ? "account.newHere" : "account.alreadyRegistered")}</AccountNote>
        <TextLink href={href(view === "login" ? "register" : "login")} prefetch={false}>{m.text(view === "login" ? "account.register" : "account.login")}</TextLink>
      </AccountActions>
      <AccountNote>{m.text("account.signInAssent")} <TextLink href={`${base}/terms`} prefetch={false}>{m.text("account.terms")}</TextLink>.</AccountNote>
    </AccountCardBody>
  </AccountCard>;
}
