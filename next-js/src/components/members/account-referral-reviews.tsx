"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { RecordItemTitle, RecordRowContent } from "@/components/admin/record-workspace";
import { Button } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { FloatingField } from "@/components/ui/floating-field";
import { GiftIcon } from "@/components/ui/icons";
import { accountSectionHref } from "@/domain/account-navigation";
import { referralReviewRules, type MemberReferralReview } from "@/domain/referral-reviews";
import { referralReviewReasonLabel, referralReviewStatusLabel, referralReviewTime } from "@/domain/referral-review-labels";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountRecords } from "./account-records";
import { accountRequest } from "./account-request";
import { AccountError } from "./account-styles";
import { AccountSectionActions } from "./account-workspace";
import { refreshNotificationUnread } from "./notification-state";

const AppealField = styled(FloatingField)`textarea { min-block-size: var(--gh-size-28); }`;

function reviewTitle(item: MemberReferralReview) {
  if ((item.status === "reversed" || item.status === "upheld") && item.reversedMs === 0) return "No unused time removed";
  if (item.status === "restored" && item.restoredMs === 0) return "Review overturned";
  return referralReviewStatusLabel[item.status];
}

export function AccountReferralReviews({ initial, locale = "en", older = false, returnTo }: {
  initial: readonly MemberReferralReview[] | null; locale?: string; older?: boolean; returnTo?: string | null;
}) {
  const router = useRouter(), id = useId(), lock = useRef(false);
  const [source, setSource] = useState(initial), [cases, setCases] = useState(initial ?? []);
  if (source !== initial) { setSource(initial); setCases(initial ?? []); }
  const [selected, setSelected] = useState<MemberReferralReview | null>(null), [statement, setStatement] = useState("");
  const [submitting, setSubmitting] = useState(false), [transition, startTransition] = useTransition();
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const busy = submitting || transition;
  if (initial !== null && cases.length === 0 && !older) return null;

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selected || lock.current) return;
    lock.current = true; setSubmitting(true); setError("");
    try {
      const result = await accountRequest<{ case: MemberReferralReview }>("referral-reviews", { id: selected.id, revision: selected.revision, statement });
      setCases(previous => previous.map(item => item.id === result.case.id ? result.case : item));
      setSelected(null); setStatement(""); setNotice("Your appeal has been sent for review.");
      void refreshNotificationUnread(); startTransition(() => router.refresh());
    } catch { setError("Unable to send the appeal. Refresh the cases and try again."); }
    finally { lock.current = false; setSubmitting(false); }
  }

  const reviewsHref = accountSectionHref(locale, "referrals", returnTo);
  const oldest = cases.length === referralReviewRules.pageSize ? cases.at(-1) : undefined;
  return <div data-account-referral-reviews>
    <AccountRecords locale={locale} title="Reward reviews" items={cases} busy={busy} hashPrefix="review-"
      empty={<AccountFine role="status">{initial === null ? "Reward reviews are temporarily unavailable." : "No older reviews."}</AccountFine>}
      feedback={notice && <AccountFine role="status">{notice}</AccountFine>}
      row={item => <RecordRowContent icon={<GiftIcon />} primary={<RecordItemTitle>{reviewTitle(item)}</RecordItemTitle>}
        secondary={<time dateTime={item.updatedAt}>{formatSubscriptionExpiry(new Date(item.updatedAt))}</time>} />}
      detail={item => <>
        <h3>{reviewTitle(item)}</h3>
        <p>Reason for review: {referralReviewReasonLabel[item.reason]}</p>
        <AccountFine><time dateTime={item.updatedAt}>{formatSubscriptionExpiry(new Date(item.updatedAt))}</time></AccountFine>
        {(item.reversedMs > 0 || item.restoredMs > 0) && <AccountFine>Removed: {referralReviewTime(item.reversedMs)} · Restored: {referralReviewTime(item.restoredMs)}</AccountFine>}
      </>}
      actions={item => item.canAppeal && <Button type="button" variant="secondary" disabled={busy}
        onClick={() => { setSelected(item); setStatement(""); setError(""); setNotice(""); }}>Appeal</Button>}
      pagination={(older || oldest) && <AccountSectionActions as="nav" aria-label="Reward review pages">
        {older && <AccountActionLink href={reviewsHref} prefetch={false}>Latest reviews</AccountActionLink>}
        {oldest && <AccountActionLink href={`${reviewsHref}&reviewBefore=${encodeURIComponent(`${oldest.updatedAt}_${oldest.id}`)}`} prefetch={false}>Older reviews</AccountActionLink>}
      </AccountSectionActions>}
    />
    {selected && <CriteriaDialog id={`${id}-appeal`} title="Appeal reward review" open onCancel={() => { if (!busy) setSelected(null); }} closeLabel="Close appeal" busy={busy}
      footer={<><CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</CriteriaDialogButton>
        <CriteriaDialogButton type="submit" form={`${id}-form`} disabled={busy || statement.trim().length < 3}>Send appeal</CriteriaDialogButton></>}>
      <form id={`${id}-form`} method="post" action="/api/account/referral-reviews" onSubmit={submit}>
        <AppealField label="Why should we review this decision?"><textarea required minLength={3} maxLength={referralReviewRules.appealLength} value={statement} onChange={event => setStatement(event.target.value)} /></AppealField>
        <AccountFine>Use support references where available. Omit phone numbers, passwords and verification codes.</AccountFine>
        {error && <AccountError role="alert">{error}</AccountError>}
      </form></CriteriaDialog>}
  </div>;
}
