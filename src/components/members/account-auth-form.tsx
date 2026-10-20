"use client";

import { useState, type FormEvent } from "react";
import { PhoneInput, TextLink } from "@/components/ui/controls";
import { CheckIcon, ChevronLeftIcon, LockIcon, UserIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { MemberForm } from "./member-controls";
import { AccountActions, AccountCard, AccountCardBody, AccountCardHeading, AccountError, AccountNote, AccountPrimary, AccountTextButton } from "./account-styles";
import { accountRequest, NewPasswordFields, PasswordInput, ProofExpiry, VerificationDelivery, VerificationForm, type VerificationChallenge, type VerificationChannel, type VerificationProof } from "./account-security";

export type AccountAuthView = "login" | "register" | "reset" | "code";

export function AccountAuthForm({ locale, view = "login", returnTo }: { locale: string; view?: AccountAuthView; returnTo: string | null }) {
  const m = createMessages(locale), [mode, setMode] = useState(view), [phone, setPhone] = useState("256");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [channel, setChannel] = useState<VerificationChannel>("whatsapp");
  const [challenge, setChallenge] = useState<VerificationChallenge>(), [proof, setProof] = useState<VerificationProof>();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const title = proof ? "account.newPassword" : challenge ? "account.enterVerification" : mode === "reset" ? "account.resetPassword" : mode === "register" ? "account.register" : mode === "code" ? "account.administratorLogin" : "account.login";
  const base = `/${resolveLocale(locale)}/account`;
  const href = (next: AccountAuthView) => `${base}?${new URLSearchParams({ view: next, ...(returnTo ? { return: returnTo } : {}) })}`;
  const restart = () => { setChallenge(undefined); setProof(undefined); setError(""); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (proof && password !== confirm) { setError(m.text("account.passwordMismatch")); return; }
    setBusy(true); setError("");
    try {
      if (proof) {
        const result = await accountRequest<{ next: string }>("password", { phone, password, verificationToken: proof.verificationToken });
        location.replace(result.next);
      } else if (mode === "login") {
        const result = await accountRequest<{ next: string }>("login", { phone, password, ...(returnTo ? { return: returnTo } : {}) });
        location.replace(result.next);
      } else {
        setChallenge(await accountRequest<VerificationChallenge>("verification", { purpose: mode === "register" ? "register" : mode === "code" ? "login" : "reset", phone, channel }));
        setBusy(false);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  async function verified(result: VerificationProof) {
    if (mode === "register") {
      const response = await accountRequest<{ next: string }>("register", { phone, password, verificationToken: result.verificationToken, ...(returnTo ? { return: returnTo } : {}) });
      location.replace(response.next);
    } else if (mode === "code") {
      await accountRequest<{ next: string }>("login", { phone, verificationToken: result.verificationToken });
      location.replace("/admin");
    } else { setPassword(""); setProof(result); }
  }
  return <AccountCard data-account-auth data-analytics-ignore>
    <AccountCardHeading>{mode === "reset" ? <LockIcon /> : <UserIcon />}<h1>{m.text(title)}</h1></AccountCardHeading>
    <AccountCardBody>
      {challenge && !proof ? <VerificationForm locale={locale} purpose={mode === "register" ? "register" : mode === "code" ? "login" : "reset"} phone={phone}
        initialChallenge={challenge} onVerified={verified} onBack={restart} />
        : <MemberForm method="post" action={`/api/account/${proof ? "password" : mode === "login" ? "login" : mode === "register" ? "register" : "verification"}`} onSubmit={submit} data-analytics-ignore aria-busy={busy}>
          {proof ? <><p><CheckIcon /> {m.text("account.phoneVerified")}</p>
            <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
            <ProofExpiry locale={locale} proof={proof} onRestart={restart} />
          </> : <>
            {mode === "reset" && <AccountNote>{m.text("account.resetHelp")}</AccountNote>}
            {mode === "code" && <AccountNote>{m.text("account.administratorLoginHelp")}</AccountNote>}
            <PhoneInput name="phone" label={m.text(mode === "reset" ? "account.registeredNumber" : "account.phoneNumber")} value={phone} onValueChange={setPhone} required />
            {(mode === "login" || mode === "register") && <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current={mode === "login"}
              {...(mode === "register" ? { hint: m.text("account.passwordHint") } : {})} />}
            {mode === "login" && <AccountTextButton variant="quiet" onClick={() => { setMode("reset"); setError(""); setPassword(""); }}>{m.text("account.forgotPassword")}</AccountTextButton>}
            {mode === "login" && <AccountTextButton variant="quiet" onClick={() => { setMode("code"); setError(""); setPassword(""); }}>{m.text("account.administratorLogin")}</AccountTextButton>}
            {mode !== "login" && <VerificationDelivery locale={locale} value={channel} onChange={setChannel} disabled={busy} />}
            {mode !== "login" && channel === "whatsapp" && <AccountNote>{m.text("account.whatsappRequired")}</AccountNote>}
            {mode === "register" && <AccountNote>{m.text("account.registerHelp")}</AccountNote>}
          </>}
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={busy}>{m.text(busy ? "account.working" : proof ? "account.savePassword" : mode === "login" ? "account.login" : mode === "register" ? "account.createAccount" : "account.sendCode")}</AccountPrimary>
          {(mode === "reset" || mode === "code") && <AccountTextButton variant="quiet" disabled={busy} onClick={() => { restart(); setMode("login"); setPassword(""); }}><ChevronLeftIcon />{m.text("account.back")}</AccountTextButton>}
        </MemberForm>}
      {!challenge && !proof && (mode === "login" || mode === "register") && <>
        <AccountActions><AccountNote>{m.text(mode === "login" ? "account.newHere" : "account.alreadyRegistered")}</AccountNote>
          <TextLink href={href(mode === "login" ? "register" : "login")} prefetch={false}>{m.text(mode === "login" ? "account.register" : "account.login")}</TextLink>
        </AccountActions>
        <AccountNote>{m.text("account.signInAssent")} <TextLink href={`/${resolveLocale(locale)}/terms`} prefetch={false}>{m.text("account.terms")}</TextLink>.</AccountNote>
      </>}
    </AccountCardBody>
  </AccountCard>;
}
