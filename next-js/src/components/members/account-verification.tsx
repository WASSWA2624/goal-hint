"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TextInput } from "@/components/ui/controls";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChevronRightIcon, KeyIcon } from "@/components/ui/icons";
import { normalizePhone } from "@/domain/phone";
import { parseVerificationCode } from "@/domain/verification-code";
import { memberAuthPath, memberAuthReturnFields, memberSignOutToLoginPath } from "@/domain/member-navigation";
import { createMessages } from "@/i18n/messages";
import { AccountFormSupport, type AdminContact } from "./admin-contact";
import { AccountFormHeader } from "./account-form-header";
import { accountRequest } from "./account-request";
import { AccountCard, AccountCardBody, AccountCodeField, AccountError, AccountLink, AccountNote, AccountPrimary,
  AccountSecondaryActions } from "./account-styles";
import { MemberForm, MemberSignOut } from "./member-controls";
import { PasswordRecoveryDialog } from "./password-recovery-dialog";

type CodeFormJourney = { locale: string; returnTo: string | null; checkout?: boolean; contact: AdminContact };
type CodeFormProps = CodeFormJourney & (
  { purpose: "account"; phone: string; openRecovery?: boolean } | { purpose: "password-reset"; phone?: string }
);

/** Both verification flows keep codes in component memory and submit only after an explicit confirmation. */
function AccountCodeForm({ locale, returnTo, checkout = false, contact, ...flow }: CodeFormProps) {
  const m = createMessages(locale), recovery = flow.purpose === "password-reset";
  const [phone, setPhone] = useState(flow.phone ?? "256");
  const [code, setCode] = useState("");
  const [error, setError] = useState(""), [invalidCode, setInvalidCode] = useState(false);
  const [busy, setBusy] = useState(false), [recoveryOpen, setRecoveryOpen] = useState(!recovery && flow.openRecovery === true);
  const codeInput = useRef<HTMLInputElement>(null), codeRevision = useRef(0), clipboardPending = useRef(false);
  const canonicalPhone = normalizePhone(phone);
  const loginHref = memberAuthPath("login", returnTo, checkout);
  const hasRestrictedSession = !recovery || !!flow.phone;
  const returnBody = memberAuthReturnFields(returnTo, checkout);
  function updateCode(value: string) { codeRevision.current++; setCode(value); setInvalidCode(false); setError(""); }
  function closeRecovery() {
    setRecoveryOpen(false);
    if (!recovery && flow.openRecovery) history.replaceState(history.state, "", memberAuthPath("verify", returnTo, checkout));
  }
  useEffect(() => { if (flow.phone && !recoveryOpen) codeInput.current?.focus(); }, [flow.phone, recoveryOpen]);

  function pasteCode(value: unknown, reportError: boolean) {
    const parsed = parseVerificationCode(value);
    if (parsed !== null) updateCode(parsed);
    else { codeRevision.current++; if (reportError) { setInvalidCode(true); setError(""); } }
  }
  async function readCopiedCode(input: HTMLInputElement) {
    // A deliberate click/tap may allow clipboard access; automatic focus never requests it.
    if (busy || input.value || clipboardPending.current || !window.isSecureContext || !navigator.clipboard?.readText) return;
    const revision = codeRevision.current;
    clipboardPending.current = true;
    try {
      const copied = await navigator.clipboard.readText();
      if (input.isConnected && document.activeElement === input && !input.disabled && !input.value && revision === codeRevision.current)
        pasteCode(copied, false);
    } catch { /* Native paste, keyboard suggestions and manual entry remain available. */ }
    finally { clipboardPending.current = false; }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || recovery && !canonicalPhone) return;
    const parsed = parseVerificationCode(code);
    if (parsed === null || invalidCode) { setInvalidCode(true); return; }
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string }>(recovery ? "reset-code" : "verify", {
        ...(recovery ? { phone } : {}), code: parsed, ...returnBody });
      location.replace(result.next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : m.text("account.unavailable")); setBusy(false); }
  }
  return <AccountCard data-account-auth data-account-verification={flow.purpose} data-verification-step="code" data-analytics-ignore>
    <AccountFormHeader icon={KeyIcon} title={m.text(recovery ? "account.enterCode" : "account.verifyAccount")}
      description={m.text(recovery ? "account.resetSteps" : "account.codeHelp")} />
    <AccountCardBody>
      {flow.phone && <AccountNote>{m.text("account.existingCode", { suffix: (canonicalPhone ?? phone).slice(-3) })}</AccountNote>}
      <MemberForm method="post" action={`/api/account/${recovery ? "reset-code" : "verify"}`} onSubmit={verify}
        data-account-step-form="code" data-analytics-ignore aria-busy={busy}>
        {recovery && !flow.phone && <PhoneInput name="phone" label={m.text("account.registeredNumber")} value={phone} onValueChange={value => {
          setPhone(value); updateCode("");
        }} lookup required disabled={busy} hint="" />}
        <AccountCodeField><TextInput ref={codeInput} name="code" label={m.text("account.verificationCode")} value={code}
          onChange={event => {
            const value = event.currentTarget.value;
            if (/^[0-9]{0,6}$/u.test(value)) updateCode(value);
            else { codeRevision.current++; setInvalidCode(true); setError(""); }
          }}
          onPaste={event => { event.preventDefault(); if (!busy) pasteCode(event.clipboardData.getData("text"), true); }}
          onClick={event => { if (event.isTrusted && event.button === 0) void readCopiedCode(event.currentTarget); }}
          autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} required disabled={busy} data-analytics-ignore data-validated-code
          error={invalidCode ? <span role="alert">{m.text("account.invalidCode")}</span> : undefined} /></AccountCodeField>
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy || recovery && !canonicalPhone || code.length !== 6 || invalidCode}>{m.text(recovery ? "account.continueReset" : "account.verifyCode")}<ChevronRightIcon /></AccountPrimary>
      </MemberForm>
      <AccountSecondaryActions aria-label={m.text("account.formActions")} data-account-secondary-actions>
        <AccountLink href={memberAuthPath("forgot", returnTo, checkout)} prefetch={false} aria-haspopup="dialog" onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); setRecoveryOpen(true);
        }}>{m.text("account.forgotPassword")}</AccountLink>
        {hasRestrictedSession ? <MemberSignOut logoutAction={memberSignOutToLoginPath(checkout ? returnTo : null)} disabled={busy} variant="quiet">{m.text("auth.backToSignIn")}</MemberSignOut>
          : <AccountLink href={loginHref} prefetch={false}>{m.text("auth.backToSignIn")}</AccountLink>}
      </AccountSecondaryActions>
      <AccountFormSupport locale={locale} contact={contact} />
      {recoveryOpen && <PasswordRecoveryDialog locale={locale} contact={contact} phone={phone} returnTo={returnTo} checkout={checkout} onClose={closeRecovery} />}
    </AccountCardBody>
  </AccountCard>;
}

export function AccountVerificationForm(props: CodeFormJourney & { phone: string; openRecovery?: boolean }) {
  return <AccountCodeForm {...props} purpose="account" />;
}

export function LegacyPasswordCodeForm(props: CodeFormJourney & { phone?: string }) {
  return <AccountCodeForm {...props} purpose="password-reset" />;
}
