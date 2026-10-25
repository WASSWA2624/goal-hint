"use client";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { formatPhone } from "@/domain/phone";
import { formatPeriodEnd } from "@/domain/subscription-period";
import type { OwnerNotice } from "@/domain/owner-members";
import { paymentNoticeKindLabel, paymentNoticeLabel } from "@/domain/payment-notification";
import { CloseIcon, ResetIcon, UserIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { Hint } from "./admin-form";
import { ActionNotices, useCodeAction } from "./code-tools";
import { Panel, PanelHead, RowList, RowMeta, RowTitle, TextAction } from "./desk-styles";

/**
 * Account-update SMS notices that need the owner: not sent, refused, unconfirmed, unsupported or waiting too long. Accepted
 * means the gateway took it, never that the member's phone received it. The list is server-seeded and refreshed after an action.
 */
export function PaymentNotices({ notices, now }: { notices: readonly OwnerNotice[]; now: number }) {
  const action = useCodeAction();
  const send = (notice: OwnerNotice, kind: "resend" | "dismiss") => void action.send("/api/admin/notices", { action: kind, id: notice.id },
    kind === "resend" ? "SMS notice queued again." : "SMS notice dismissed.");
  return <Panel aria-labelledby="payment-notices-title" data-payment-notices>
    <PanelHead><h2 id="payment-notices-title">SMS notices</h2></PanelHead>
    <ActionNotices action={action} />
    <RowList>{notices.map(notice => {
      const closed = ["failed", "uncertain", "unsupported", "unavailable", "cancelled"].includes(notice.state);
      return <NoticeRow key={notice.id}>
        <span>
          <RowTitle>{notice.reference ?? "Unknown reference"}<small>{paymentNoticeKindLabel(notice.kind)}</small></RowTitle>
          <RowMeta>{paymentNoticeLabel(notice, now)} · {formatPeriodEnd(new Date(notice.attemptedAt ?? notice.createdAt))}
            {notice.phone ? <> · +{formatPhone(notice.phone)}</> : null}</RowMeta>
          {["failed", "uncertain"].includes(notice.state) && <Hint>The member may receive this notice twice if the earlier one arrived.</Hint>}
        </span>
        <Actions>
          <TextAction as={Link} href={`/admin/subscribers?accountId=${encodeURIComponent(notice.accountId)}`} prefetch={false}><UserIcon />View subscriber</TextAction>
          {["failed", "uncertain"].includes(notice.state) && <TextAction type="button" disabled={action.busy} onClick={() => send(notice, "resend")}
            aria-label={`Send the SMS for ${notice.reference ?? "this notice"} again`}><ResetIcon />Send again</TextAction>}
          {closed && <TextAction type="button" disabled={action.busy} onClick={() => send(notice, "dismiss")}
            aria-label={`Dismiss the SMS notice for ${notice.reference ?? "this notice"}`}><CloseIcon />Dismiss</TextAction>}
        </Actions>
      </NoticeRow>;
    })}</RowList>
  </Panel>;
}

const NoticeRow = styled.li`
  display: grid;
  gap: 4px 12px;
  padding: 8px 14px;
  container-type: inline-size;
  > span:first-child { display: grid; gap: 2px; min-inline-size: 0; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption}; font-weight: normal; }
  ${media.desktop} { padding-inline: 16px 10px; }
`;
const Actions = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
  margin-inline-start: -4px;
`;
