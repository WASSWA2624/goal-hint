"use client";

import styled, { css, keyframes } from "styled-components";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import type { PaymentEvidence } from "@/domain/payment-sms";
import { createMessages } from "@/i18n/messages";
import type { ScreenshotProgress } from "./payment-ocr";

/** What a payment must cover: a plan, or a credit top-up (durationDays null). */
export type PaymentTarget = Readonly<{ priceUgx: number; durationDays: number | null }>;
/** Where a screenshot read is: the two reader stages, then the moment its text is searched for the ID and amount. */
export type ReadingState = ScreenshotProgress | Readonly<{ stage: "finding"; progress: number }>;
const stages = ["preparing", "reading", "finding"] as const;
const spin = keyframes`to { transform: rotate(360deg); }`;
const smallText = css`font-size: 12px; line-height: 18px;`;

const Panel = styled.div`
  display: grid; gap: 6px; min-inline-size: 0; padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surfaceMuted};
  progress { inline-size: 100%; block-size: 6px; accent-color: ${({ theme }) => theme.color.brand}; }
`;
const Steps = styled.ol`display: grid; gap: 4px; margin: 0; padding: 0; list-style: none;`;
const Step = styled.li<{ $state: "done" | "active" | "waiting" }>`
  display: flex; align-items: center; gap: 8px; min-inline-size: 0; ${smallText}
  color: ${({ theme, $state }) => $state === "waiting" ? theme.color.mutedText : theme.color.text};
  font-weight: ${({ theme, $state }) => $state === "active" ? theme.typography.weight.bold : "inherit"};
  > svg, > i { flex: none; inline-size: 14px; block-size: 14px; }
  > svg { color: ${({ theme }) => theme.color.brand}; }
`;
const Spinner = styled.i`
  border: 2px solid ${({ theme }) => theme.color.border}; border-block-start-color: ${({ theme }) => theme.color.brand};
  border-radius: ${({ theme }) => theme.radius.circle}; animation: ${spin} 0.8s linear infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; }
`;
const Waiting = styled.i`border: 2px solid ${({ theme }) => theme.color.border}; border-radius: ${({ theme }) => theme.radius.circle};`;
const List = styled.ul`display: grid; gap: 4px; margin: 0; padding: 0; list-style: none;`;
const Item = styled.li<{ $ok: boolean }>`
  display: flex; align-items: flex-start; gap: 6px; min-inline-size: 0; ${smallText} overflow-wrap: anywhere;
  color: ${({ theme, $ok }) => $ok ? theme.color.text : theme.color.outcome.incorrect.text};
  > svg { flex: none; inline-size: 14px; block-size: 14px; margin-block-start: 2px; color: ${({ theme, $ok }) => $ok ? theme.color.brand : "currentColor"}; }
`;

/** The three steps of reading a screenshot, with a bar for the current one, so the member sees the work as it happens. */
export function ReadingProgress({ locale, state, compact = false }: { locale: string; state: ReadingState; compact?: boolean }) {
  const m = createMessages(locale), current = stages.indexOf(state.stage);
  const label = m.text(`subscribe.reading.${state.stage}`);
  return <Panel data-reading-progress={state.stage}>
    {compact ? <span>{m.text("subscribe.wizard.reading")}</span> : <Steps aria-hidden="true">{stages.map((stage, index) => <Step key={stage} $state={index < current ? "done" : index === current ? "active" : "waiting"}>
      {index < current ? <CheckIcon /> : index === current ? <Spinner /> : <Waiting />}<span>{m.text(`subscribe.reading.${stage}`)}</span>
    </Step>)}</Steps>}
    <progress max={100} value={state.progress} aria-label={label} />
  </Panel>;
}

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
