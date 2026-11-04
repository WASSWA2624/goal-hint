"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/controls";
import type { TrialStatus } from "@/domain/subscription-summary";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { AccountBlock, AccountBlockActions, AccountBlockText, AccountFine } from "./account-overview";
import { accountRequest } from "./account-security";
import { AccountError } from "./account-styles";
import { refreshMemberSession } from "./member-session";

export function FreeTrialControl({ locale, trial, days, showHistory = false }: {
  locale: string; trial: TrialStatus | undefined; days: number; showHistory?: boolean;
}) {
  const m = createMessages(locale), router = useRouter(), description = useId();
  const inFlight = useRef(false), [pending, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [activated, setActivated] = useState<Extract<TrialStatus, { state: "active" }> | null>(null);
  const status = trial?.state === "available" && activated ? activated : trial;
  if (!status || status.state === "available" && days < 1 || !showHistory && (status.state === "expired" || status.state === "forfeited")) return null;
  async function activate() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      setActivated(await accountRequest<Extract<TrialStatus, { state: "active" }>>("trial", {}));
      startRefresh(() => router.refresh());
      void refreshMemberSession();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : m.text("account.unavailable"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <AccountBlock aria-label={m.text("freeTrial.label")} aria-busy={busy || pending} data-free-trial={status.state}>
    <AccountBlockText>
      <AccountFine id={description} role="status">{status.state === "available"
        ? m.plural("freeTrial.offer", days)
        : status.state === "active" ? m.text("freeTrial.activeUntil", { end: formatPeriodEnd(new Date(status.endsAt)) })
          : m.text(status.state === "expired" ? "freeTrial.expired" : "freeTrial.forfeited")}</AccountFine>
      {error && <AccountError role="alert">{error}</AccountError>}
    </AccountBlockText>
    {status.state === "available" && <AccountBlockActions><Button type="button" variant="secondary" aria-describedby={description}
      disabled={busy || pending} onClick={() => void activate()}>{m.text("freeTrial.activate")}</Button></AccountBlockActions>}
  </AccountBlock>;
}
