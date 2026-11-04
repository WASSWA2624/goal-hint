"use client";

import { ButtonLink } from "@/components/ui/controls";
import { CheckIcon } from "@/components/ui/icons";
import { formatPeriodEnd } from "@/domain/subscription-period";
import { createMessages } from "@/i18n/messages";
import { AccountCard, AccountCardBody } from "./account-styles";
import { AccountFormHeader } from "./account-form-header";

/** Display an existing trial after verifying the account's number. */
export type FreeTrialAccess = Readonly<{ days: number; startsAt: string; endsAt: string; active: boolean }>;

export function FreeTrialNotice({ locale, trial, next }: { locale: string; trial: FreeTrialAccess; next: string }) {
  const m = createMessages(locale);
  return <AccountCard data-free-trial="active" data-analytics-ignore>
    <AccountFormHeader icon={CheckIcon} title={m.text("freeTrial.activeTitle")} />
    <AccountCardBody>
      <p role="status">{m.plural("freeTrial.duration", trial.days)}<br />
        {m.text("freeTrial.ends", { end: formatPeriodEnd(new Date(trial.endsAt)) })}</p>
      <ButtonLink href={next} prefetch={false} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // Authentication replaced the cookie; reload the destination with its new session and access tier.
        event.preventDefault(); location.replace(next);
      }}>{m.text("freeTrial.browse")}</ButtonLink>
    </AccountCardBody>
  </AccountCard>;
}
