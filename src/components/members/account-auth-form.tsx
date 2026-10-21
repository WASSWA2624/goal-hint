"use client";

import { useState, type FormEvent } from "react";
import { PhoneInput, TextLink } from "@/components/ui/controls";
import { ChevronLeftIcon, LockIcon, UserIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { AdminContactLinks, type AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";
import { AccountActions, AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPrimary, AccountTextButton } from "./account-styles";
import { accountRequest, PasswordInput } from "./account-security";

export type AccountAuthView = "login" | "register" | "forgot";

/** Phone and password only; recovery is requested here and the admin shares the temporary password manually. */
export function AccountAuthForm({ locale, view = "login", returnTo, contact }: { locale: string; view?: AccountAuthView; returnTo: string | null; contact: AdminContact }) {
  const m = createMessages(locale), [mode, setMode] = useState(view), [phone, setPhone] = useState("256");
  const [password, setPassword] = useState(""), [requested, setRequested] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const base = `/${resolveLocale(locale)}`;
  const href = (next: AccountAuthView) => `${base}/account?${new URLSearchParams({ view: next, ...(returnTo ? { return: returnTo } : {}) })}`;
  const show = (next: AccountAuthView) => { setMode(next); setError(""); setPassword(""); setRequested(false); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      if (mode === "forgot") { await accountRequest("forgot", { phone }); setRequested(true); setBusy(false); return; }
      const result = await accountRequest<{ next: string }>(mode, { phone, password, ...(returnTo ? { return: returnTo } : {}) });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  if (mode === "forgot") return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading><LockIcon /><h1>{m.text("account.resetPassword")}</h1></AccountCardHeading>
    <AccountCardBody>
      <p>{m.text("account.resetHelp")}</p>
      <AccountNote>{m.text("account.resetSteps")}</AccountNote>
      <MemberForm method="post" action="/api/account/forgot" onSubmit={submit} data-analytics-ignore aria-busy={busy}>
        <PhoneInput name="phone" label={m.text("account.phoneNumber")} value={phone} onValueChange={setPhone} required />
        {requested && <p role="status">{m.text("account.resetSent")}</p>}
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy || requested}>{m.text(busy ? "account.working" : "account.sendResetRequest")}</AccountPrimary>
      </MemberForm>
      {contact.contactPhone || contact.whatsappPhone ? <AdminContactLinks locale={locale} contact={contact} text={m.text("account.resetMessage")} />
        : <AccountNote><TextLink href={`${base}/contact`} prefetch={false}>{m.text("account.contactAdmin")}</TextLink></AccountNote>}
      <AccountTextButton variant="quiet" onClick={() => show("login")}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>
    </AccountCardBody>
  </AccountCard>;
  return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading><UserIcon /><h1>{m.text(mode === "register" ? "account.register" : "account.login")}</h1></AccountCardHeading>
    <AccountCardBody>
      <MemberForm method="post" action={`/api/account/${mode}`} onSubmit={submit} data-analytics-ignore aria-busy={busy}>
        <PhoneInput name="phone" label={m.text("account.phoneNumber")} value={phone} onValueChange={setPhone} required />
        <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current={mode === "login"}
          {...(mode === "register" ? { hint: m.text("account.passwordHint") } : {})} />
        {mode === "login" && <AccountTextButton variant="quiet" onClick={() => show("forgot")}>{m.text("account.forgotPassword")}</AccountTextButton>}
        {mode === "register" && <AccountNote>{m.text("account.registerHelp")}</AccountNote>}
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : mode === "login" ? "account.login" : "account.createAccount")}</AccountPrimary>
      </MemberForm>
      <AccountActions><AccountNote>{m.text(mode === "login" ? "account.newHere" : "account.alreadyRegistered")}</AccountNote>
        <TextLink href={href(mode === "login" ? "register" : "login")} prefetch={false}>{m.text(mode === "login" ? "account.register" : "account.login")}</TextLink>
      </AccountActions>
      <AccountNote>{m.text("account.signInAssent")} <TextLink href={`${base}/terms`} prefetch={false}>{m.text("account.terms")}</TextLink>.</AccountNote>
    </AccountCardBody>
  </AccountCard>;
}
