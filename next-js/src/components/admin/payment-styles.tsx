"use client";

import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { ActionButton, adminControl } from "./admin-form";
import { DeskHeadEnd, Drawer, EmptyPanel, Segmented, TextAction, visuallyHidden } from "./desk-styles";
import { desktopBalancedReview } from "./payment-balanced-styles";
import { RecordCard, RecordDetailHead, RecordDetails, RecordFeedback, RecordFooter, RecordHead, RecordItem, RecordList, RecordListFooter, RecordListScroll, RecordListTools, RecordWorkspace } from "./record-workspace";

/**
 * Compact desktop queue beside a persistent review. Phones keep the queue-to-review flow.
 */
const panelLook = css`
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.surface};
`;
const hairline = css`${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}`;
const focusRing = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;
const desktopOnly = css`${media.belowDesktop} { display: none; }`;
const phoneOnly = css`${media.desktop} { display: none; }`;

export const PaymentLayout = styled(RecordWorkspace)`
  ${media.desktop} { grid-template-columns: clamp(17.5rem, 24vw, 20.625rem) minmax(0, 1fr); }
`;
export const PaymentUnavailable = styled.section`
  display: grid;
  align-content: start;
  gap: 16px;
  min-inline-size: 0;
  padding: 20px;
  ${media.desktop} { > h1 { ${visuallyHidden} } }
`;

/** On phones the review replaces the title row; the h1 stays for assistive technology. */
export const PaymentHead = styled(RecordHead)<{ $reviewing: boolean }>`
  ${media.belowDesktop} {
    gap: 12px;
    > nav { order: 3; flex: 1 1 100%; }
    ${({ $reviewing }) => $reviewing && css`
      min-block-size: 0;
      h1 { ${visuallyHidden} }
      > :not(h1) { display: none; }
    `}
  }
`;
export const HeadEnd = styled(DeskHeadEnd)``;

/** Four equal status tabs on phones, wrapping long labels instead of scrolling. */
export const StatusTabs = styled(Segmented)`
  && > a[aria-disabled="true"] { cursor: not-allowed; opacity: 0.6; }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    && > a { min-block-size: 48px; padding: 4px; font-size: 0.78125rem; line-height: 1.2; text-align: center; white-space: normal; }
  }
`;

export const PaymentFeedback = styled(RecordFeedback)`
  scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
`;

export const RefreshSquare = styled.button<{ $changed: boolean }>`
  display: grid;
  place-items: center;
  inline-size: ${({ theme }) => theme.control.minHeight};
  block-size: ${({ theme }) => theme.control.minHeight};
  padding: 0;
  border: ${hairline};
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surface};
  cursor: pointer;
  > svg { font-size: 1.125rem; }
  ${({ theme, $changed }) => $changed && css`color: ${theme.color.onAction}; background: ${theme.gradient.action}; border-color: transparent;`}
  &:disabled { cursor: not-allowed; opacity: 0.55; }
  ${focusRing}
`;

/** Desktop: a panel with the toolbar above the ticket tray. Phones: the parts sit straight on the page. */
export const QueuePanel = styled(RecordList)<{ $reviewing: boolean }>`
  ${media.belowDesktop} {
    gap: 12px;
    ${({ $reviewing }) => $reviewing && css`display: none;`}
  }
  > h2 { ${visuallyHidden} }
`;
export const QueueBar = styled(RecordListTools)`
  ${media.belowDesktop} { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; border: 0; > :first-child { flex-basis: 100%; max-inline-size: none; } }
`;
export const QueueFilters = styled.div`
  display: none;
  ${media.desktop} {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    label { min-inline-size: 0; }
    label > span { ${visuallyHidden} }
    select { ${adminControl} min-block-size: 28px; padding: 2px 18px 2px 0; border: 0; border-radius: ${({ theme }) => theme.radius.control}; font-size: 0.75rem; color: ${({ theme }) => theme.color.mutedText}; }
  }
`;
export const SearchField = styled.div`
  position: relative;
  min-inline-size: 0;
  > svg { position: absolute; inset-inline-start: 12px; inset-block-start: 50%; transform: translateY(-50%); font-size: 1.125rem; color: ${({ theme }) => theme.color.mutedText}; pointer-events: none; }
  > input { ${adminControl} padding-inline-start: 38px; }
  > input::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  > label { ${visuallyHidden} }
  ${media.desktop} { > input { min-block-size: 34px; padding-block: 4px; font-size: 0.8125rem; border-radius: ${({ theme }) => theme.radius.control}; } }
`;
export const QueueSummary = styled(RecordListFooter).attrs({ as: "p" })`
  gap: 2px 6px;
  > span + span::before { content: "·"; margin-inline-end: 6px; }
  > [data-payment-queue-updated] { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.belowDesktop} { margin-block-start: -4px; }
`;

export const TicketTray = styled(RecordListScroll)<{ $opened: boolean }>`
  ${({ $opened }) => !$opened && css`${media.belowDesktop} { && [aria-current="true"] { border-color: ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; } }`}
`;
export const Ticket = styled(RecordItem)`
  ${media.belowDesktop} {
    align-content: start; align-items: baseline; gap: 2px 12px; min-block-size: 64px;
    ${panelLook}
    &[aria-current="true"] { border-color: ${({ theme }) => theme.color.link}; }
  }
  ${media.desktop} {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: start;
    gap: 4px 10px;
    padding: 12px;
  }
`;
export const TicketProvider = styled.span`
  display: none;
  ${media.desktop} {
    display: grid; place-items: start center; grid-column: 1; grid-row: 1; align-self: start; min-block-size: 0;
    [data-payment-logo="mtn"] { inline-size: 30px; block-size: 18px; }
    [data-payment-logo="airtel"] { inline-size: 23px; block-size: 23px; }
  }
`;
export const TicketPhone = styled.span`
  ${media.desktop} { grid-column: 2; grid-row: 2; white-space: nowrap; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
export const TicketPlan = styled.span`
  ${media.belowDesktop} { > [data-ticket-duration] { display: none; } }
  ${media.desktop} { grid-column: 3; grid-row: 2; justify-self: end; max-inline-size: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: end; font-size: 0.6875rem; > [data-ticket-duration] { display: none; } }
`;
export const TicketRef = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  overflow-wrap: anywhere;
  ${media.desktop} { display: block; grid-column: 2; grid-row: 1; align-self: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; > [data-ticket-inline-network] { display: none; } }
`;
export const TicketAmount = styled.span`
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  font-variant-numeric: tabular-nums;
  text-align: end;
  white-space: nowrap;
  ${media.desktop} { grid-column: 3; grid-row: 1; font-size: 0.75rem; }
`;
export const TicketMeta = styled.span`
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  ${media.desktop} { display: contents; > [data-ticket-separator] { display: none; } }
`;
export const TicketTime = styled(TicketMeta)`
  text-align: end;
  white-space: nowrap;
  ${media.belowDesktop} { > [data-ticket-timezone] { display: none; } }
  ${media.desktop} { display: block; grid-column: 2 / -1; grid-row: 3; justify-self: start; text-align: start; font-size: 0.6875rem; }
`;
export const TicketWarn = styled.span`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-block-start: 4px;
  color: ${({ theme }) => theme.color.outcome.pending.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > svg { flex: none; font-size: 0.875rem; }
  ${media.desktop} { grid-column: 2 / -1; grid-row: 4; font-size: 0.6875rem; margin: 0; }
`;
export const QueueEmpty = styled(EmptyPanel)`
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { grid-row: 2; align-self: start; padding-block: 28px; }
`;

export const ReviewSection = styled(RecordDetails)<{ $reviewing: boolean }>`
  scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
  ${media.belowDesktop} { ${({ $reviewing }) => !$reviewing && css`display: none;`} }
`;

/* ---------------- Review ---------------- */

/** Phones: a bare stack (the zones are panels); desktop: one panel with a header row over the zones. Facts are dense 13px. */
export const ReviewCard = styled(RecordCard)`
  dl > div { padding-block: 8px; }
  dd { font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${desktopBalancedReview}
`;
export const ReviewHead = styled(RecordDetailHead)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  ${media.belowDesktop} { gap: 2px 10px; }
  min-inline-size: 0;
  > h2 {
    flex: 1 1 100%;
    ${media.belowDesktop} { font-size: 1.25rem; }
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
  }
  > [data-review-meta] { order: 3; }
  > [data-review-badge] { order: 4; }
  > [data-review-link] { order: 5; flex: 0 0 100%; justify-content: flex-start; margin-inline-start: -4px; }
  ${media.desktop} {
    > h2 { flex: 0 1 auto; }
    > [data-review-badge] { order: 1; margin-inline-start: -6px; }
    > [data-review-meta] { order: 2; }
    > [data-review-link] { order: 3; flex: 0 0 auto; margin-inline-start: 0; }
  }
`;
export const ReviewNav = styled.div`
  order: -1;
  display: flex;
  flex: 1 1 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block: -6px 6px;
  ${media.desktop} { order: 9; flex: 0 0 auto; margin: 0 0 0 auto; > [data-review-back] { display: none; } }
`;
export const ReviewBack = styled(TextAction)`
  gap: 4px;
  padding-inline: 0 8px;
`;
export const Stepper = styled.div`
  display: inline-flex;
  align-items: center;
  margin-inline-start: auto;
  ${panelLook}
  > button {
    display: grid;
    place-items: center;
    inline-size: 44px;
    block-size: 44px;
    padding: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.surface};
    color: ${({ theme }) => theme.color.link};
    background: none;
    cursor: pointer;
    > svg { font-size: 1.125rem; }
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
    ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  }
  > span { padding: 0 2px; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  ${media.desktop} { border-radius: ${({ theme }) => theme.radius.control}; > button { inline-size: 28px; block-size: 28px; border-radius: ${({ theme }) => theme.radius.control}; } > span { padding-inline: 4px; font-size: 0.75rem; } }
`;
export const ReviewMeta = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.body};
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
`;

const statusTone = (status: string) => status === "pending" ? "pending" : status === "approved" ? "correct" : status === "rejected" ? "incorrect" : "void";
export const PaymentBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  min-block-size: 20px;
  padding: 0 7px;
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].text};
  background: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].background};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 1;
  white-space: nowrap;
`;

const zonePadding = "14px";
const zoneBody = css`
  display: grid;
  align-content: start;
  gap: 12px;
  min-inline-size: 0;
  padding: ${zonePadding};
`;
/**
 * Desktop: proof, expected payment and decision side by side (decision drops under the other two below 73rem, where the
 * sidebar leaves too little width). Phones: no box of its own, so each zone is a panel in the review stack and the decision
 * bar can stick to the bottom of the screen for the whole review.
 */
export const ReviewZones = styled.div<{ $proof: boolean }>`
  min-inline-size: 0;
  ${media.belowDesktop} { display: contents; }
  ${media.desktop} {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    > * { min-inline-size: 0; }
    > * + * { border-inline-start: ${hairline}; }
    ${({ $proof }) => $proof && css`> :last-child { grid-column: 1 / -1; border-inline-start: 0; border-block-start: ${hairline}; }`}
  }
  @media (min-width: 73rem) {
    ${({ $proof }) => $proof && css`
      grid-template-columns: minmax(16rem, 1.15fr) minmax(15rem, 1fr) minmax(17rem, 20rem);
      > :last-child { grid-column: auto; border-inline-start: ${hairline}; border-block-start: 0; }
      > :first-child { border-end-start-radius: ${({ theme }) => theme.radius.surface}; }
    `}
  }
`;
export const ProofZone = styled.section`
  ${zoneBody}
  justify-items: center;
  background: ${({ theme }) => theme.color.surfaceMuted};
  > p:first-child { justify-self: start; }
  ${media.belowDesktop} {
    gap: 8px;
    padding-block-end: 0;
    border: ${hairline};
    border-radius: ${({ theme }) => theme.radius.surface};
  }
  ${media.desktop} { padding: 16px 18px 18px; }
`;
export const ProofFrame = styled.div<{ $clipped: boolean }>`
  inline-size: 100%;
  max-inline-size: 300px;
  min-inline-size: 0;
  ${media.belowDesktop} {
    max-inline-size: 280px;
    ${({ $clipped }) => $clipped && css`
      max-block-size: 184px;
      overflow: hidden;
      mask-image: linear-gradient(#000 72%, transparent);
    `}
  }
`;
export const ProofImage = styled.img`
  display: block;
  inline-size: 100%;
  block-size: auto;
  border: ${hairline};
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surface};
  ${media.desktop} { inline-size: auto; max-inline-size: 100%; max-block-size: 30rem; margin-inline: auto; object-fit: contain; }
`;
/** Phones show "Open full size" once the clipped screenshot is enlarged (or when nothing is clipped). */
export const ProofActions = styled.div<{ $hideLink: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0 16px;
  ${media.belowDesktop} { > a { ${({ $hideLink }) => $hideLink && css`display: none;`} } }
`;
export const ProofToggle = styled(TextAction)`font-size: ${({ theme }) => theme.typography.scale.body}; ${phoneOnly}`;

export const ExpectedZone = styled.section`
  ${zoneBody}
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { padding: 16px 18px 18px; }
  > dl { border-block-start: ${hairline}; }
`;
export const BigAmount = styled.div`
  display: grid;
  gap: 2px;
  min-inline-size: 0;
  > strong { font-size: 1.875rem; line-height: 1.2; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  > span { color: ${({ theme }) => theme.color.outcome.pending.text}; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.desktop} { > strong { font-size: 2rem; } }
`;
export const NetworkValue = styled.dd`
  && { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
`;
export const PaymentWarnings = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.outcome.pending.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  > p { display: flex; align-items: flex-start; gap: 8px; margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
  > p > svg { flex: none; margin-block-start: 2px; font-size: 1rem; }
`;
export const CheckList = styled.ul`
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: flex; align-items: flex-start; gap: 8px; font-size: ${({ theme }) => theme.typography.scale.body}; line-height: 1.45; overflow-wrap: anywhere; }
  > li > svg { flex: none; margin-block-start: 1px; font-size: 1rem; color: ${({ theme }) => theme.color.mutedText}; }
  > li[data-tone="good"] > svg { color: ${({ theme }) => theme.color.outcome.correct.text}; }
`;

/** A drawer inside a zone: hairline above, flush with the zone's text; on phones it spans the panel edge to edge. */
export const ZoneDrawer = styled(Drawer)`
  border-block-end: 0;
  border-block-start: ${hairline};
  &:last-child { border-block-end: 0; }
  > summary { min-block-size: 44px; padding: 0 ${zonePadding}; }
  > summary > svg:last-child { color: ${({ theme }) => theme.color.mutedText}; }
  > div { padding: 2px ${zonePadding} 14px; }
  ${media.belowDesktop} {
    margin-inline: -${zonePadding};
    &:last-child { margin-block-end: -${zonePadding}; }
  }
  ${media.desktop} {
    > summary { padding-inline: 0; }
    > div { padding-inline: 0; }
  }
`;
export const ShieldMark = styled.span<{ $clear: boolean }>`
  display: inline-flex;
  color: ${({ theme, $clear }) => $clear ? theme.color.outcome.correct.text : theme.color.outcome.pending.text};
  > svg { font-size: 1.125rem; }
`;

/** Desktop: the decision column; phones: no box, so its panels and the decision bar join the review stack. */
export const DecisionZone = styled.div`
  min-inline-size: 0;
  ${media.belowDesktop} { display: contents; }
  ${media.desktop} {
    display: grid;
    align-content: start;
    gap: 12px;
    padding: 16px 18px 18px;
    > [data-decision-bar] { order: 1; }
    > [data-reject] { order: 2; }
  }
`;
const decisionPanel = css`
  ${zoneBody}
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { padding: 0; }
`;
export const DecisionPanel = styled.div`${decisionPanel}`;
export const ApprovalForm = styled.form`${decisionPanel}`;

/** Phones: its own panel, shown only while open (the decision bar opens it). Desktop: a danger drawer under Approve. */
export const RejectDrawer = styled(ZoneDrawer)`
  ${media.belowDesktop} {
    margin: 0;
    ${panelLook}
    &:last-child { margin: 0; }
    &:not([open]) { display: none; }
    [data-reject-inline] { display: none; }
  }
`;
export const DecisionBar = styled(RecordFooter)<{ $rejecting: boolean }>`
  ${media.belowDesktop} { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr); }
  background: ${({ theme }) => theme.color.surface};
  ${media.belowDesktop} { > button { min-inline-size: 0; padding-inline: 10px; } }
  > [data-payment-footer-summary] { ${desktopOnly} }
  > [data-reject-toggle], > [data-reject-submit] { ${phoneOnly} }
  ${({ $rejecting }) => $rejecting ? css`
    ${media.belowDesktop} { > [data-payment-approve] { display: none; } }
  ` : css`> [data-reject-submit] { display: none; }`}
`;
/** Danger outline while closed ("Reject"); a plain secondary button while the reject panel is open ("Cancel"). */
export const RejectToggle = styled(ActionButton)<{ $open: boolean }>`
  ${({ theme, $open }) => !$open && css`
    color: ${theme.color.outcome.incorrect.text};
    background: ${theme.color.surface};
    border-color: ${theme.color.outcome.incorrect.border};
  `}
`;
export const CopyRow = styled.dd`
  && { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0 8px; }
  > span { overflow-wrap: anywhere; }
`;
export const RecoveryStack = styled.div`
  display: grid;
  gap: 12px;
  min-inline-size: 0;
  h3 { font-size: 0.9375rem; }
`;
