"use client";

import styled, { css } from "styled-components";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import type { PaymentEvidence } from "@/domain/payment-sms";
import { createMessages } from "@/i18n/messages";

/** What a payment must cover: a plan, or a credit top-up (durationDays null). */
export type PaymentTarget = Readonly<{ priceUgx: number; durationDays: number | null }>;
const smallText = css`font-size: var(--gh-font-secondary); line-height: var(--gh-size-4_5);`;

const List = styled.ul`display: grid; gap: var(--gh-spacing-1); margin: 0; padding: 0; list-style: none;`;
const Item = styled.li<{ $ok: boolean }>`
  display: flex; align-items: flex-start; gap: var(--gh-spacing-1_5); min-inline-size: 0; ${smallText} overflow-wrap: anywhere;
  color: ${({ theme, $ok }) => $ok ? theme.color.text : theme.color.outcome.incorrect.text};
  > svg { flex: none; inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); margin-block-start: var(--gh-spacing-0_5); color: ${({ theme, $ok }) => $ok ? theme.color.brand : "currentColor"}; }
`;

/**
 * What a pasted message or a screenshot gave the form, judged against the plan or top-up chosen now: the transaction ID (and
 * the one it replaced), the amount, and the network. A missing ID or an amount below what is due is a warning line; with no
 * valid top-up amount chosen yet (target null), the amount is only shown.
 */
export function evidenceRows(locale: string, evidence: PaymentEvidence, target: PaymentTarget | null, networkName: string | null,
  replaced: string | null = null, showId = true, needAmount = false): readonly { ok: boolean; text: string }[] {
  const m = createMessages(locale), rows: { ok: boolean; text: string }[] = [];
  const topUp = !target || target.durationDays === null, prefix = topUp ? "credit" : "subscribe";
  const planName = target?.durationDays ? m.plural("paywall.days", target.durationDays) : "", price = m.number(target?.priceUgx ?? 0);
  if (showId) rows.push(evidence.transactionId
    ? { ok: true, text: m.text(replaced ? "subscribe.found.idReplaced" : "subscribe.found.id", { id: evidence.transactionId, previous: replaced ?? "" }) }
    : { ok: false, text: m.text("subscribe.found.noId") });
  if (evidence.amount === null && needAmount) rows.push({ ok: false, text: m.text("subscribe.found.noAmount") });
  if (evidence.amount !== null) {
    const amount = m.number(evidence.amount);
    rows.push(!target ? { ok: true, text: `UGX ${amount}` }
      : evidence.amount < target.priceUgx ? { ok: false, text: m.text(`${prefix}.found.amountShort`, { amount, price, plan: planName }) }
        : evidence.amount === target.priceUgx ? { ok: true, text: m.text(`${prefix}.found.amount`, { amount, plan: planName }) }
          : { ok: true, text: m.text(`${prefix}.found.amountMore`, { amount, price, plan: planName }) });
  }
  if (networkName) rows.push({ ok: true, text: networkName });
  return rows;
}

/**
 * The checklist form of evidenceRows; `showId` drops the ID row once a typed or pasted ID has replaced it, and `needAmount`
 * (a screenshot, which must show the amount) says when none was found.
 */
export function EvidenceFindings({ locale, evidence, target, networkName, replaced = null, showId = true, needAmount = false }: {
  locale: string; evidence: PaymentEvidence; target: PaymentTarget | null; networkName: string | null; replaced?: string | null; showId?: boolean; needAmount?: boolean;
}) {
  const rows = evidenceRows(locale, evidence, target, networkName, replaced, showId, needAmount);
  return rows.length > 0 && <List data-evidence-findings>{rows.map((row) => <Item key={row.text} $ok={row.ok}>{row.ok ? <CheckIcon /> : <InfoIcon />}<span>{row.text}</span></Item>)}</List>;
}
