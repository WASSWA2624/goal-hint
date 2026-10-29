"use client";

import { useState, type FormEvent } from "react";
import { TextLink } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { InfoIcon, UserIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import type { AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";
import { AccountActions, AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPrimary, AccountSingleDeviceInfo } from "./account-styles";
import { accountRequest, PasswordInput } from "./account-security";
import { ForgotPasswordForm } from "./account-verification";
import { FreeTrialNotice, type FreeTrialAccess } from "./free-trial-notice";

export type AccountAuthView = "login" | "register" | "forgot";

/** Registration creates a pending account; a delivered code establishes ownership of its number. */
export function AccountAuthForm({ locale, view = "login", returnTo, contact }: { locale: string; view?: AccountAuthView; returnTo: string | null; contact: AdminContact }) {
  const m = createMessages(locale), [phone, setPhone] = useState("256");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [createdTrial, setCreatedTrial] = useState<{ trial: FreeTrialAccess; next: string } | null>(null);
  const base = `/${resolveLocale(locale)}`;
  const href = (next: AccountAuthView) => `${base}/account?${new URLSearchParams({ view: next, ...(returnTo ? { return: returnTo } : {}) })}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string; trial?: FreeTrialAccess }>(view, { phone, password, ...(returnTo ? { return: returnTo } : {}) });
      if (view === "register" && result.trial) { setPassword(""); setCreatedTrial({ trial: result.trial, next: result.next }); return; }
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  if (view === "forgot") return <ForgotPasswordForm locale={locale} returnTo={returnTo} contact={contact} />;
  if (createdTrial) return <FreeTrialNotice locale={locale} {...createdTrial} />;
  return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading><UserIcon /><h1>{m.text(view === "register" ? "auth.signUp" : "auth.signIn")}</h1></AccountCardHeading>
    <AccountCardBody>
      <MemberForm method="post" action={`/api/account/${view}`} onSubmit={submit} data-analytics-ignore aria-busy={busy}>
        <PhoneInput name="phone" label={m.text("account.phoneNumber")} value={phone} onValueChange={setPhone} lookup={view === "login"} required disabled={busy} hint="" />
        <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current={view === "login"}
          placeholder={m.text("account.passwordPlaceholder")} disabled={busy} />
        {view === "login" && <AccountActions>
          <TextLink href={href("forgot")} prefetch={false}>{m.text("account.forgotPassword")}</TextLink>
          <AccountSingleDeviceInfo><summary aria-label={m.text("account.singleDeviceNotice")} title={m.text("account.singleDeviceNotice")}><InfoIcon /></summary>
            <p role="note">{m.text("account.singleDeviceNotice")}</p>
          </AccountSingleDeviceInfo>
        </AccountActions>}
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : view === "login" ? "auth.signIn" : "auth.signUp")}</AccountPrimary>
      </MemberForm>
      <AccountActions>
        <TextLink href={href(view === "login" ? "register" : "login")} prefetch={false}>{m.text(view === "login" ? "auth.signUp" : "auth.signIn")}</TextLink>
        <AccountNote>{m.text("account.ageAssent")} · <TextLink href={`${base}/terms`} prefetch={false}>{m.text("account.terms")}</TextLink></AccountNote>
      </AccountActions>
    </AccountCardBody>
  </AccountCard>;
}
