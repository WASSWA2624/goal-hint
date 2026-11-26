"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LockIcon } from "@/components/ui/icons";
import { memberAuthPath, memberLoginPath, passwordResetSuccessStatus } from "@/domain/member-navigation";
import { createMessages } from "@/i18n/messages";
import { AccountFormHeader } from "./account-form-header";
import { AccountRequestError, accountRequest } from "./account-request";
import { NewPasswordFields, PasswordChangeNote } from "./account-security";
import { AccountCard, AccountCardBody, AccountError, AccountLink, AccountPrimary } from "./account-styles";
import { MemberForm } from "./member-controls";

const validatePath = "password-reset/validate";
const redeemPath = "password-reset/redeem";
const resetTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const linkUnavailable = (failure: unknown) => failure instanceof AccountRequestError && failure.status === 410;

function readResetFragment() {
  const hash = location.hash;
  if (hash) history.replaceState(history.state, "", location.pathname + location.search);
  return hash.slice(1);
}

export function PasswordResetLinkForm({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  const token = useRef<string | null>(null), inFlight = useRef(false);
  const [phase, setPhase] = useState<"checking" | "ready" | "unusable" | "retry" | "completed">("checking");
  const [checkRevision, setCheckRevision] = useState(0), [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [error, setError] = useState("");

  useEffect(() => {
    if (token.current === null) token.current = readResetFragment();
    const value = token.current;
    let active = true;
    async function check() {
      if (!resetTokenPattern.test(value)) { if (active) setPhase("unusable"); return; }
      try {
        const result = await accountRequest<{ status: string }>(validatePath, { token: value });
        if (active && token.current === value) setPhase(result.status === "valid" ? "ready" : "unusable");
      } catch (failure) {
        if (!active || token.current !== value) return;
        setPhase(linkUnavailable(failure) ? "unusable" : "retry");
        setError(failure instanceof Error ? failure.message : messages.text("account.unavailable"));
      }
    }
    void check();
    return () => { active = false; };
  }, [checkRevision, messages]);

  useEffect(() => {
    function openLink() {
      if (!resetTokenPattern.test(location.hash.slice(1))) return;
      token.current = readResetFragment();
      setPassword(""); setConfirm(""); setError(""); setPhase("checking");
      setCheckRevision(value => value + 1);
    }
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || phase !== "ready" || !token.current) return;
    if (password !== confirm) { setError(messages.text("account.passwordMismatch")); return; }
    const submittedToken = token.current;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const result = await accountRequest<{ status: string }>(redeemPath, { token: submittedToken, password, confirm });
      if (result.status !== "completed") throw new Error(messages.text("account.unavailable"));
      token.current = "";
      setPassword(""); setConfirm(""); setPhase("completed");
      location.replace(`${memberLoginPath}&status=${passwordResetSuccessStatus}`);
    } catch (failure) {
      if (token.current !== submittedToken) return;
      if (linkUnavailable(failure)) {
        token.current = "";
        setPassword(""); setConfirm(""); setPhase("unusable");
      } else setError(failure instanceof Error ? failure.message : messages.text("account.unavailable"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <AccountCard data-account-auth data-account-link-reset data-analytics-ignore aria-busy={phase === "checking" || busy}>
    <AccountFormHeader icon={LockIcon} title={messages.text("account.chooseNewPassword")} />
    <AccountCardBody>
      {phase === "checking" && <p role="status">{messages.text("account.recoveryChecking")}</p>}
      {phase === "ready" && <>
        <PasswordChangeNote locale={locale} />
        <MemberForm method="post" action={`/api/account/${redeemPath}`} onSubmit={submit} data-analytics-ignore>
          <NewPasswordFields locale={locale} password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm}
            reset requireMinimumLength={false} disabled={busy} />
          {error && <AccountError role="alert">{error}</AccountError>}
          <AccountPrimary type="submit" disabled={busy}>{messages.text("account.recoverySave")}</AccountPrimary>
        </MemberForm>
      </>}
      {phase === "retry" && <><AccountError role="alert">{error}</AccountError>
        <AccountPrimary type="button" onClick={() => {
          setError(""); setPhase("checking"); setCheckRevision(value => value + 1);
        }}>{messages.text("account.recoveryRetry")}</AccountPrimary>
      </>}
      {phase === "unusable" && <p role="status">{messages.text("account.recoveryUnusable")}</p>}
      {(phase === "unusable" || phase === "retry") && <AccountLink href={memberAuthPath("forgot")} prefetch={false}>{messages.text("account.recoveryRequestNew")}</AccountLink>}
      {phase === "completed" && <><p role="status">{messages.text("account.recoveryCompleted")}</p>
        <AccountLink href={memberLoginPath} prefetch={false}>{messages.text("auth.backToSignIn")}</AccountLink>
      </>}
    </AccountCardBody>
  </AccountCard>;
}
