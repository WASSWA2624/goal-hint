"use client";

import styled from "styled-components";
import { RecordRowContent } from "@/components/admin/record-workspace";
import { ButtonLink } from "@/components/ui/controls";
import { ChevronLeftIcon, GiftIcon } from "@/components/ui/icons";
import { accountSectionHref } from "@/domain/account-navigation";
import { memberNextPath } from "@/domain/member-navigation";
import type { ReferralSummary } from "@/domain/referrals";
import { referralInvitation } from "@/domain/referral-invitation";
import { formatShortDay, formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountRecords } from "./account-records";
import { AccountFacts, AccountPanel } from "./account-workspace";
import { InvitationActions } from "./invitation-actions";

const InviteTitle = styled.span`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-2);
  > svg { color: ${({ theme }) => theme.color.brand}; font-size: var(--gh-font-heading); }
`;

function rewardTime(locale: string, ms: number) {
  const m = createMessages(locale), minutes = Math.floor(ms / 60_000), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return days ? `${m.plural("paywall.days", days)}${hours ? ` ${m.plural("account.hoursRemaining", hours)}` : ""}`
    : hours ? m.plural("account.hoursRemaining", hours) : minutes ? m.plural("referrals.minutes", minutes)
      : ms > 0 ? m.text("referrals.underMinute") : m.plural("paywall.days", 0);
}

export function AccountReferralSummary({ locale, summary, returnTo }: { locale: string; summary: ReferralSummary | null; returnTo: string | null }) {
  const m = createMessages(locale);
  return <AccountPanel title={m.text("account.section.referrals")} data-account-referral-summary
    actions={summary && <AccountActionLink href={accountSectionHref(locale, "referrals", returnTo)} prefetch={false}>{m.text("referrals.view")}</AccountActionLink>}>
    {!summary ? <AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine>
      : <AccountFacts $columns={summary.availableDays === undefined ? 2 : 3}>
        <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
        {summary.availableDays !== undefined && <div><dt>Days available to redeem</dt><dd>{m.number(summary.availableDays)}</dd></div>}
        <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
      </AccountFacts>}
  </AccountPanel>;
}

export function AccountReferrals({ locale, summary, returnTo = null, redemptionOpen = false }: {
  locale: string; summary: ReferralSummary | null; returnTo?: string | null; redemptionOpen?: boolean;
}) {
  const m = createMessages(locale);
  const back = <ButtonLink href={accountSectionHref(locale, "overview", returnTo)} variant="quiet" contextBack prefetch={false} data-context-back>
    <ChevronLeftIcon />{m.text("navigation.back")}</ButtonLink>;
  if (!summary) return <AccountPanel title={m.text("referrals.rewards")} actions={back}>
    <AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine>
  </AccountPanel>;
  const canRedeem = redemptionOpen && (summary.availableDays ?? 0) > 0;
  return <>
    <AccountPanel title={<InviteTitle><GiftIcon />{m.text("referrals.invite")}</InviteTitle>} actions={back} data-account-referrals>
      <InvitationActions locale={locale} links={referralInvitation(summary.code, locale)}>
        <p>{m.text("referrals.hint")}</p>
      </InvitationActions>
    </AccountPanel>
    <AccountPanel title={m.text("referrals.rewards")} data-referral-rewards
      actions={canRedeem && <AccountActionLink href={memberNextPath("subscribe", returnTo)} prefetch={false}>Redeem days</AccountActionLink>}>
      <AccountFacts $columns={summary.availableDays === undefined ? 2 : 3}>
        {summary.availableDays !== undefined && <div><dt>Days available to redeem</dt><dd>{m.number(summary.availableDays)}</dd></div>}
        <div><dt>{m.text("referrals.earned")}</dt><dd>{m.number(summary.earnedDays)}</dd></div>
        <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
      </AccountFacts>
      <AccountFine style={{ marginBlockStart: "var(--gh-spacing-3)" }}>{m.text("referrals.useHint")}</AccountFine>
    </AccountPanel>
    <div data-referral-history>
      <AccountRecords locale={locale} title={m.text("referrals.history")} items={summary.history}
        empty={<AccountFine>{m.text("referrals.empty")}</AccountFine>}
        row={row => <RecordRowContent icon={<GiftIcon />}
          primary={m.text(`referrals.${row.status}`)}
          secondary={<time dateTime={row.registeredAt}>{formatShortDay(new Date(row.registeredAt))}</time>} />}
        detail={row => <>
          <h3>{m.text(`referrals.${row.status}`)}</h3>
          <AccountFacts $columns={2}>
            <div><dt>{m.text("referrals.registered")}</dt><dd><time dateTime={row.registeredAt}>{formatSubscriptionExpiry(new Date(row.registeredAt))}</time></dd></div>
            <div><dt>{m.text("referrals.reward")}</dt><dd>{row.status === "rewarded" ? `+${m.plural("paywall.days", 1)}` : "—"}</dd></div>
          </AccountFacts>
        </>} />
    </div>
  </>;
}
