"use client";

import { ButtonLink } from "@/components/ui/controls";
import { CheckIcon, UserIcon } from "@/components/ui/icons";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { AccountCard, AccountCardBody, AccountCardHeading, AccountNote } from "./account-styles";

/** Display metadata only; the verification session remains responsible for granting device access. */
export type FreeTrialAccess = Readonly<{ days: number; startsAt: string; endsAt: string; active: boolean }>;

export function FreeTrialNotice({ locale, trial, next }: { locale: string; trial: FreeTrialAccess; next: string }) {
  const m = createMessages(locale), NoticeIcon = trial.active ? CheckIcon : UserIcon;
  return <AccountCard data-free-trial={trial.active ? "active" : "verification-required"} data-analytics-ignore>
    <AccountCardHeading><NoticeIcon /><h1>{m.text(trial.active ? "freeTrial.activeTitle" : "freeTrial.createdTitle")}</h1></AccountCardHeading>
    <AccountCardBody>
      <p role="status">{m.plural("freeTrial.duration", trial.days)}<br />
        {m.text("freeTrial.ends", { end: formatPeriodEnd(new Date(trial.endsAt)) })}</p>
      {!trial.active && <AccountNote>{m.text("freeTrial.verifyNotice")}</AccountNote>}
      <ButtonLink href={next} prefetch={false} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Authentication replaced the cookie; reload the destination with its new session and access tier.
        event.preventDefault(); location.replace(next);
      }}>{m.text(trial.active ? "freeTrial.browse" : "freeTrial.verify")}</ButtonLink>
    </AccountCardBody>
  </AccountCard>;
}
