"use client";

import { filledTableRows } from "@/components/ui/filled-surfaces";
import styled from "styled-components";
import { ButtonLink } from "@/components/ui/controls";
import { accountSectionHref } from "@/domain/account-navigation";
import type { ReferralSummary } from "@/domain/referrals";
import { referralInvitation } from "@/domain/referral-invitation";
import { formatShortDay, formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountFacts, AccountPanel } from "./account-workspace";
import { ChevronLeftIcon, GiftIcon } from "@/components/ui/icons";
import { InvitationActions } from "./invitation-actions";
const InviteTitle = styled.span`
  display: inline-flex; align-items: center; gap: var(--gh-spacing-2);
  > svg { color: ${({ theme }) => theme.color.brand}; font-size: var(--gh-font-heading); }
`;
const History = styled.table`
  ${filledTableRows}
  border-collapse: collapse; inline-size: 100%; font-size: ${({ theme }) => theme.typography.scale.secondary};
  th, td { text-align: start; padding: var(--gh-spacing-2_5) var(--gh-spacing-2); border-block-end: 0; }
  th { color: ${({ theme }) => theme.color.mutedText}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  td:last-child, th:last-child { text-align: end; white-space: nowrap; }
  tr:last-child td { border-block-end: 0; }
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
    actions={<AccountActionLink href={accountSectionHref(locale, "referrals", returnTo)} prefetch={false}>{m.text("referrals.invite")}</AccountActionLink>}>
    {!summary ? <AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine> : <AccountFacts $columns={2}>
      <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
      {summary.availableDays !== undefined && <div><dt>Days available to redeem</dt><dd>{summary.availableDays} · <a href={`/${locale}/subscribe`}>Redeem days</a></dd></div>}
      <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
    </AccountFacts>}
  </AccountPanel>;
}

export function AccountReferrals({ locale, summary }: { locale: string; summary: ReferralSummary | null }) {
  const m = createMessages(locale);
  const back = <ButtonLink href={accountSectionHref(locale)} variant="quiet" contextBack prefetch={false} data-context-back>
    <ChevronLeftIcon />{m.text("navigation.back")}</ButtonLink>;
  if (!summary) return <AccountPanel title={m.text("account.section.referrals")} actions={back}><AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine></AccountPanel>;
  return <>
    <AccountPanel title={<InviteTitle><GiftIcon />{m.text("referrals.invite")}</InviteTitle>} actions={back} data-account-referrals>
      <InvitationActions locale={locale} links={referralInvitation(summary.code, locale)}>
        <p>{m.text("referrals.hint")}</p>
      </InvitationActions>
    </AccountPanel>
    <AccountPanel title={m.text("referrals.rewards")} data-referral-rewards>
      <AccountFacts $columns={3}>
        {summary.availableDays !== undefined && <div><dt>Days available to redeem</dt><dd>{summary.availableDays} · <a href={`/${locale}/subscribe`}>Redeem days</a></dd></div>}
        <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
        <div><dt>{m.text("referrals.earned")}</dt><dd>{m.number(summary.earnedDays)}</dd></div>
        <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
      </AccountFacts>
      <AccountFine style={{ marginBlockStart: "var(--gh-spacing-3)" }}>{m.text("referrals.useHint")}</AccountFine>
    </AccountPanel>
    <AccountPanel title={m.text("referrals.history")} data-referral-history>
      {!summary.history.length ? <AccountFine>{m.text("referrals.empty")}</AccountFine> : <History>
        <thead><tr><th scope="col">{m.text("referrals.registered")}</th><th scope="col">{m.text("referrals.status")}</th><th scope="col">{m.text("referrals.reward")}</th></tr></thead>
        <tbody>{summary.history.map(row => <tr key={row.id}>
          <td><time dateTime={row.registeredAt} title={formatSubscriptionExpiry(new Date(row.registeredAt))}>{formatShortDay(new Date(row.registeredAt))}</time></td>
          <td>{m.text(`referrals.${row.status}`)}</td><td>{row.status === "rewarded" ? `+${m.plural("paywall.days", 1)}` : "—"}</td>
        </tr>)}</tbody>
      </History>}
    </AccountPanel>
  </>;
}
