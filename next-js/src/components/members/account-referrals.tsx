"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import styled from "styled-components";
import { Button, ButtonLink, TextInput } from "@/components/ui/controls";
import { accountSectionHref } from "@/domain/account-navigation";
import type { ReferralSummary } from "@/domain/referrals";
import { referralInvitation } from "@/domain/referral-invitation";
import { formatShortDay, formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountFacts, AccountPanel } from "./account-workspace";
import { CopyIcon, GiftIcon, ShareIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { invitationShareAvailable, serverInvitationShareAvailable, shareInvitation, subscribeInvitationShare } from "./invitation-share";

const LinkRow = styled.div`
  display: flex; align-items: end; gap: 8px; max-inline-size: 48rem;
  > :first-child { flex: 1; min-inline-size: 0; }
  input { min-inline-size: 0; }
  > button { flex: none; inline-size: auto; }
`;
const ShareActions = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-inline-size: 48rem;
  > button { grid-column: 1 / -1; }
  > a, > button { min-block-size: ${({ theme }) => theme.control.minHeight}; }
  ${media.tablet} { display: flex; flex-wrap: wrap; > a, > button { inline-size: auto; } }
`;
const InviteContent = styled.div`
  display: grid; gap: 16px;
  > p { color: ${({ theme }) => theme.color.text}; }
`;
const InviteTitle = styled.span`
  display: inline-flex; align-items: center; gap: 8px;
  > svg { color: ${({ theme }) => theme.color.brand}; font-size: 1.25rem; }
`;
const History = styled.table`
  border-collapse: collapse; inline-size: 100%; font-size: ${({ theme }) => theme.typography.scale.secondary};
  th, td { text-align: start; padding: 10px 8px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
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
      <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
    </AccountFacts>}
  </AccountPanel>;
}

export function AccountReferrals({ locale, summary }: { locale: string; summary: ReferralSummary | null }) {
  const m = createMessages(locale), field = useRef<HTMLInputElement>(null), sharing = useRef(false);
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const nativeShare = useSyncExternalStore(subscribeInvitationShare, invitationShareAvailable, serverInvitationShareAvailable);
  if (!summary) return <AccountPanel title={m.text("account.section.referrals")}><AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine></AccountPanel>;
  const { invitation, whatsApp, telegram } = referralInvitation(summary.code, locale), { url } = invitation;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice(m.text("referrals.copied")); }
    catch { field.current?.focus(); field.current?.select(); setNotice(m.text("referrals.copyFallback")); }
  }
  async function share() {
    if (sharing.current) return;
    sharing.current = true; setBusy(true); setNotice("");
    try {
      const result = await shareInvitation(invitation);
      if (result === "failed") setNotice(m.text("referrals.shareFailed"));
    } finally { sharing.current = false; setBusy(false); }
  }
  return <>
    <AccountPanel title={<InviteTitle><GiftIcon />{m.text("referrals.invite")}</InviteTitle>} data-account-referrals>
      <InviteContent>
        <p>{m.text("referrals.hint")}</p>
        <ShareActions aria-label={m.text("referrals.invite")} role="group" data-invitation-actions>
          {nativeShare && <Button type="button" disabled={busy} onClick={share}><ShareIcon />{m.text("referrals.shareInvitation")}</Button>}
          <ButtonLink href={whatsApp} target="_blank" rel="noopener noreferrer" prefetch={false} variant="secondary">WhatsApp</ButtonLink>
          <ButtonLink href={telegram} target="_blank" rel="noopener noreferrer" prefetch={false} variant="secondary">Telegram</ButtonLink>
        </ShareActions>
        <LinkRow data-invite-friends><TextInput ref={field} label={m.text("referrals.link")} value={url} readOnly name="referralLink" spellCheck={false} />
          <Button type="button" variant="secondary" onClick={copy}><CopyIcon />{m.text("referrals.copy")}</Button>
        </LinkRow>
        {notice && <AccountFine role="status">{notice}</AccountFine>}
      </InviteContent>
    </AccountPanel>
    <AccountPanel title={m.text("referrals.rewards")} data-referral-rewards>
      <AccountFacts $columns={3}>
        <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
        <div><dt>{m.text("referrals.earned")}</dt><dd>{m.number(summary.earnedDays)}</dd></div>
        <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
      </AccountFacts>
      <AccountFine style={{ marginBlockStart: 12 }}>{m.text("referrals.useHint")}</AccountFine>
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
