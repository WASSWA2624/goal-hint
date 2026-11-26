"use client";

import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { TextLink } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { InfoIcon, UserIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { memberAuthPath, memberAuthReturnFields } from "@/domain/member-navigation";
import { formatPhone } from "@/domain/phone";
import { validMobilePhone } from "@/domain/phone-mobile";
import type { AdminContact } from "./admin-contact";
import { MemberForm } from "./member-controls";
import { AccountCard, AccountCardBody, AccountError, AccountFormFooter, AccountLink, AccountNote, AccountPrimary, AccountSecondaryActions, AccountSessionInfo } from "./account-styles";
import { AccountFormHeader } from "./account-form-header";
import { accountRequest, PasswordInput } from "./account-security";
import { PasswordRecoveryDialog } from "./password-recovery-dialog";

export type AccountAuthView = "login" | "register" | "forgot";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** New members can start using the account as soon as registration succeeds. */
export function AccountAuthForm({ locale, view = "login", returnTo, checkout = false, contact }: {
  locale: string; view?: AccountAuthView; returnTo: string | null; checkout?: boolean; contact: AdminContact;
}) {
  const m = createMessages(locale), [phone, setPhone] = useState("256");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ phone: string; password: string } | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(view === "forgot");
  const inFlight = useRef(false), phoneInput = useRef<HTMLInputElement>(null), dialogId = useId();
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const base = `/${resolveLocale(locale)}`;
  const href = (next: AccountAuthView) => memberAuthPath(next, returnTo, checkout);
  const action = view === "register" ? "register" : "login";
  function closeRecovery() {
    setRecoveryOpen(false);
    if (view === "forgot") history.replaceState(history.state, "", href("login"));
  }
  async function authenticate(action: "login" | "register", credentials: { phone: string; password: string }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ next: string }>(action, {
        ...credentials, ...(action === "login" ? memberAuthReturnFields(returnTo, checkout) : {}),
      });
      location.replace(result.next);
    } catch (failure) {
      setConfirmation(null);
      setError(failure instanceof Error ? failure.message : m.text("account.unavailable"));
      setBusy(false);
      inFlight.current = false;
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || confirmation || recoveryOpen) return;
    if (action === "login") {
      void authenticate(action, { phone, password });
      return;
    }
    const canonical = validMobilePhone(phone);
    if (!canonical) { setError(m.text("phone.invalid")); return; }
    setError("");
    setConfirmation({ phone: canonical, password });
  }
  return <AccountCard data-account-auth data-analytics-ignore>
    <AccountFormHeader icon={UserIcon} title={m.text(action === "register" ? "auth.signUp" : "auth.signIn")}
      description={m.text(action === "register" ? "account.registerHelp" : "account.description")}
      actions={action === "login" && <AccountSessionInfo><summary aria-label={m.text("account.sessionLimitNotice")} title={m.text("account.sessionLimitNotice")}><InfoIcon /></summary>
        <p role="note">{m.text("account.sessionLimitNotice")}</p></AccountSessionInfo>} />
    <AccountCardBody>
      <MemberForm method="post" action={`/api/account/${action}`} onSubmit={submit} data-analytics-ignore aria-busy={busy}>
        <PhoneInput ref={phoneInput} name="phone" label={m.text("account.phoneNumber")} value={phone} onValueChange={setPhone} lookup={action === "login"} required disabled={busy} hint="" />
        <PasswordInput label={m.text("account.password")} value={password} onChange={setPassword} current={action === "login"}
          placeholder={m.text("account.passwordPlaceholder")} disabled={busy} />
        {error && <AccountError role="alert">{error}</AccountError>}
        <AccountPrimary type="submit" disabled={busy || (action === "register" && !hydrated)} aria-haspopup={action === "register" ? "dialog" : undefined}>
          {m.text(action === "login" ? "auth.signIn" : "auth.signUp")}
        </AccountPrimary>
      </MemberForm>
      {confirmation && <CriteriaDialog id={dialogId} title={m.text("account.confirmSignupPhone")} open
        onCancel={() => setConfirmation(null)} closeLabel={m.text("account.cancelLabel")} busy={busy} footer={<>
          <CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={() => {
            setConfirmation(null);
            requestAnimationFrame(() => phoneInput.current?.focus());
          }}>{m.text("account.editSignupPhone")}</CriteriaDialogButton>
          <CriteriaDialogButton type="button" disabled={busy} onClick={() => void authenticate("register", confirmation)}>{m.text("account.confirmSignup")}</CriteriaDialogButton>
        </>}>
        <bdi dir="ltr">+{formatPhone(confirmation.phone)}</bdi>
      </CriteriaDialog>}
      {recoveryOpen && <PasswordRecoveryDialog locale={locale} contact={contact} phone={phone} returnTo={returnTo} checkout={checkout} onClose={closeRecovery} />}
      <AccountFormFooter>
        <AccountSecondaryActions aria-label={m.text("account.formActions")} data-account-secondary-actions>
          {action === "login" && <AccountLink href={href("forgot")} prefetch={false} aria-haspopup="dialog" onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); setRecoveryOpen(true);
          }}>{m.text("account.forgotPassword")}</AccountLink>}
          <AccountLink href={href(action === "login" ? "register" : "login")} prefetch={false}>{m.text(action === "login" ? "auth.signUp" : "auth.signIn")}</AccountLink>
        </AccountSecondaryActions>
        <AccountNote>{m.text("account.ageAssent")} · <TextLink href={`${base}/terms`} prefetch={false}>{m.text("account.terms")}</TextLink></AccountNote>
      </AccountFormFooter>
    </AccountCardBody>
  </AccountCard>;
}
