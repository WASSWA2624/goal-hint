"use client";

import { FloatingField } from "@/components/ui/floating-field";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import type { MemberReferralReview } from "@/domain/referral-reviews";
import { referralReviewRules } from "@/domain/referral-reviews";
import { accountSectionHref } from "@/domain/account-navigation";
import { referralReviewReasonLabel, referralReviewStatusLabel, referralReviewTime } from "@/domain/referral-review-labels";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { Button } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { AccountPanel } from "./account-workspace";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountError } from "./account-styles";
import { accountRequest } from "./account-security";
import { refreshNotificationUnread } from "./notification-state";
import { media } from "@/styles/theme";

const Cases = styled.ul`
  display: grid; margin: 0; padding: 0; list-style: none;
  > li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--gh-spacing-2) var(--gh-spacing-3); padding-block: var(--gh-spacing-3);
    border-block-end: 0; }
  > li:last-child { border: 0; }
  h3 { margin: 0; font: inherit; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  p { margin: var(--gh-spacing-1) 0 0; }
  button { min-block-size: var(--gh-size-11); align-self: center; }
  ${media.belowDesktop} { > li { grid-template-columns: minmax(0, 1fr); } button { justify-self: start; } }
`;
const AppealField = styled(FloatingField)`textarea { min-block-size: var(--gh-size-28); }`;

export function AccountReferralReviews({ initial, locale = "en", older = false }: { initial: readonly MemberReferralReview[] | null; locale?: string; older?: boolean }) {
  const router = useRouter(), id = useId(), lock = useRef(false);
  const [source, setSource] = useState(initial), [cases, setCases] = useState(initial ?? []);
  if (source !== initial) { setSource(initial); setCases(initial ?? []); }
  const [selected, setSelected] = useState<MemberReferralReview | null>(null), [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  if (initial !== null && cases.length === 0 && !older) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await accountRequest<{ case: MemberReferralReview }>("referral-reviews", { id: selected.id, revision: selected.revision, statement });
      setCases(previous => previous.map(item => item.id === result.case.id ? result.case : item));
      setSelected(null); setStatement(""); setNotice("Your appeal has been sent for review.");
      void refreshNotificationUnread(); router.refresh();
    } catch { setError("Unable to send the appeal. Refresh the cases and try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <AccountPanel title="Reward reviews" data-account-referral-reviews>
    {notice && <AccountFine role="status">{notice}</AccountFine>}
    {initial === null ? <AccountFine role="status">Reward reviews are temporarily unavailable.</AccountFine> : <Cases>{cases.map(item => <li key={item.id} id={`review-${item.id}`}>
      <div><h3>{(item.status === "reversed" || item.status === "upheld") && item.reversedMs === 0 ? "No unused time removed"
        : item.status === "restored" && item.restoredMs === 0 ? "Review overturned" : referralReviewStatusLabel[item.status]}</h3>
        <p>Reason for review: {referralReviewReasonLabel[item.reason]}</p>
        <AccountFine>{formatSubscriptionExpiry(new Date(item.updatedAt))}</AccountFine>
        {(item.reversedMs > 0 || item.restoredMs > 0) && <AccountFine>Removed: {referralReviewTime(item.reversedMs)} · Restored: {referralReviewTime(item.restoredMs)}</AccountFine>}
      </div>{item.canAppeal && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setSelected(item); setStatement(""); setError(""); }}>Appeal</Button>}
    </li>)}</Cases>}
    {older && <AccountActionLink href={accountSectionHref(locale, "referrals")} prefetch={false}>Latest reviews</AccountActionLink>}
    {cases.length === referralReviewRules.pageSize && <AccountActionLink href={`${accountSectionHref(locale, "referrals")}&reviewBefore=${encodeURIComponent(`${cases.at(-1)!.updatedAt}_${cases.at(-1)!.id}`)}`} prefetch={false}>Older reviews</AccountActionLink>}
    {selected && <CriteriaDialog id={`${id}-appeal`} title="Appeal reward review" open onCancel={() => { if (!busy) setSelected(null); }} closeLabel="Close appeal" busy={busy} dismissOnBackdrop={false}
      footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</CriteriaDialogButton>
        <CriteriaDialogButton type="submit" form={`${id}-form`} disabled={busy || statement.trim().length < 3}>Send appeal</CriteriaDialogButton></>}>
      <form id={`${id}-form`} method="post" action="/api/account/referral-reviews" onSubmit={submit}>
        <AppealField label={"Why should we review this decision?"}><textarea required minLength={3} maxLength={referralReviewRules.appealLength} value={statement} onChange={event => setStatement(event.target.value)} /></AppealField>
        <AccountFine>Use support references where available. Omit phone numbers, passwords and verification codes.</AccountFine>
        {error && <AccountError role="alert">{error}</AccountError>}
      </form></CriteriaDialog>}
  </AccountPanel>;
}
