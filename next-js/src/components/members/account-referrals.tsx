"use client";

import { useRef, useState } from "react";
import styled from "styled-components";
import { Button, TextInput } from "@/components/ui/controls";
import { accountSectionHref } from "@/domain/account-navigation";
import { publicPolicy } from "@/domain/public-policy";
import { referralPath, type ReferralSummary } from "@/domain/referrals";
import { formatShortDay, formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountFacts, AccountPanel } from "./account-workspace";

const LinkRow = styled.div`
  display: flex; align-items: end; flex-wrap: wrap; gap: 8px; max-inline-size: 42rem; margin-block-start: 16px;
  > :first-child { flex: 1 1 16rem; min-inline-size: 0; }
  input { min-inline-size: 0; }
  > button { flex: 0 0 auto; inline-size: auto; }
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
    actions={<AccountActionLink href={accountSectionHref(locale, "referrals", returnTo)} prefetch={false}>{m.text("referrals.view")}</AccountActionLink>}>
    {!summary ? <AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine> : <AccountFacts $columns={2}>
      <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
      <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
    </AccountFacts>}
  </AccountPanel>;
}

export function AccountReferrals({ locale, summary }: { locale: string; summary: ReferralSummary | null }) {
  const m = createMessages(locale), field = useRef<HTMLInputElement>(null), [notice, setNotice] = useState("");
  if (!summary) return <AccountPanel title={m.text("account.section.referrals")}><AccountFine role="status">{m.text("referrals.unavailable")}</AccountFine></AccountPanel>;
  const url = new URL(referralPath(summary.code), publicPolicy.origin).toString();
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice(m.text("referrals.copied")); }
    catch { field.current?.focus(); field.current?.select(); setNotice(m.text("referrals.copyFallback")); }
  }
  return <>
    <AccountPanel title={m.text("account.section.referrals")} data-account-referrals>
      <AccountFacts $columns={3}>
        <div><dt>{m.text("referrals.verified")}</dt><dd>{m.number(summary.verified)}</dd></div>
        <div><dt>{m.text("referrals.earned")}</dt><dd>{m.number(summary.earnedDays)}</dd></div>
        <div><dt>{m.text("referrals.remaining")}</dt><dd>{rewardTime(locale, summary.remainingMs)}</dd></div>
      </AccountFacts>
      <AccountFine style={{ marginBlockStart: 12 }}>{m.text("referrals.useHint")}</AccountFine>
      <LinkRow><TextInput ref={field} label={m.text("referrals.link")} value={url} readOnly name="referralLink" spellCheck={false} />
        <Button type="button" variant="secondary" onClick={copy}>{m.text("referrals.copy")}</Button></LinkRow>
      <AccountFine style={{ marginBlockStart: 8 }}>{m.text("referrals.hint")}</AccountFine>
      {notice && <AccountFine role="status" style={{ marginBlockStart: 8 }}>{notice}</AccountFine>}
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
