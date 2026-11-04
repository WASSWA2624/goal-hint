"use client";


import styled, { css } from "styled-components";
import { media } from "@/styles/theme";
import { ActionButton } from "./admin-form";
import { DeskHeadEnd, Drawer, EmptyPanel, Segmented, TextAction, visuallyHidden } from "./desk-styles";
import { desktopBalancedReview } from "./payment-balanced-styles";
import { RecordCard, RecordDetailHead, RecordDetails, RecordFeedback, RecordFooter, RecordHead, RecordList, RecordListFooter, RecordListScroll, RecordWorkspace } from "./record-workspace";

/**
 * Compact desktop queue beside a persistent review. Phones keep the queue-to-review flow.
 */
const panelLook = css`
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
`;
const desktopOnly = css`${media.belowDesktop} { display: none; }`;
const phoneOnly = css`${media.desktop} { display: none; }`;

export const PaymentLayout = styled(RecordWorkspace)`
  --record-list-default: clamp(var(--gh-size-70), 24vw, var(--gh-size-82_5));
`;
export const PaymentUnavailable = styled.section`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-4);
  min-inline-size: 0;
  > h1 { ${visuallyHidden} }
`;

/** The phone review shows its own navigation instead of the status tabs. */
export const PaymentHead = styled(RecordHead)<{ $reviewing: boolean }>`
  background: transparent;
  ${media.belowDesktop} {
    padding-inline: 0;
    > nav { flex: 1 1 100%; }
    ${({ $reviewing }) => $reviewing && css`
      min-block-size: 0;
      > :not(h1) { display: none; }
    `}
  }
`;
export const HeadEnd = styled(DeskHeadEnd)``;

/** Four equal status tabs on phones, wrapping long labels instead of scrolling. */
export const StatusTabs = styled(Segmented)`
  flex-wrap: wrap;
  overflow-x: visible;
  && > a[aria-disabled="true"] { cursor: not-allowed; opacity: var(--gh-opacity-60); }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    && > a { min-block-size: var(--form-control-height); padding: var(--gh-spacing-1); font-size: var(--gh-font-secondary); line-height: var(--gh-leading-control); text-align: center; white-space: normal; }
  }
`;

export const PaymentFeedback = styled(RecordFeedback)`
  scroll-margin-block-start: calc(var(--app-header-content-height, var(--gh-size-16)) + var(--gh-spacing-4));
`;

/** Desktop: a panel with the toolbar above the ticket tray. Phones: the parts sit straight on the page. */
export const QueuePanel = styled(RecordList)<{ $reviewing: boolean }>`
  ${media.belowDesktop} {
    gap: var(--gh-spacing-3);
    ${({ $reviewing }) => $reviewing && css`display: none;`}
  }
  > h2 { ${visuallyHidden} }
`;
export const QueueBar = styled.div`
  flex: 1 0 100%;
  min-inline-size: 0;
`;
export const QueueFilters = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
`;
export const QueueSummary = styled(RecordListFooter)`
  gap: var(--gh-spacing-0_5) var(--gh-spacing-1_5);
  > span + span::before { content: "·"; margin-inline-end: var(--gh-spacing-1_5); }
  > [data-payment-queue-updated] { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.belowDesktop} { margin-block-start: calc(-1 * var(--gh-spacing-1)); }
`;

export const TicketTray = styled(RecordListScroll)<{ $opened: boolean }>`
  ${({ $opened }) => !$opened && css`${media.belowDesktop} { && [aria-current="true"] {  background: ${({ theme }) => theme.color.surface}; } }`}
`;
export const TicketWarn = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.outcome.pending.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > svg { flex: none; font-size: var(--gh-font-emphasis); }

`;
export const QueueEmpty = styled(EmptyPanel)`
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { grid-row: 2; align-self: start; padding-block: var(--gh-spacing-7); }
`;

export const ReviewSection = styled(RecordDetails)<{ $reviewing: boolean }>`
  scroll-margin-block-start: calc(var(--app-header-content-height, var(--gh-size-16)) + var(--gh-spacing-4));
  ${media.belowDesktop} { ${({ $reviewing }) => !$reviewing && css`display: none;`} }
`;

/* ---------------- Review ---------------- */

/** Phones: a bare stack (the zones are panels); desktop: one panel with a header row over the zones. Facts are dense 13px. */
export const ReviewCard = styled(RecordCard)`
  dl > div { padding-block: var(--gh-spacing-2); }
  dd { font-size: ${({ theme }) => theme.typography.scale.body}; }
  ${desktopBalancedReview}
`;
export const ReviewHead = styled(RecordDetailHead)`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  ${media.belowDesktop} { gap: var(--gh-spacing-0_5) var(--gh-spacing-2_5); }
  min-inline-size: 0;
  > h2 {
    flex: 1 1 100%;
    ${media.belowDesktop} { font-size: var(--gh-font-heading); }
    line-height: var(--gh-leading-compact);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    scroll-margin-block-start: calc(var(--app-header-content-height, var(--gh-size-16)) + var(--gh-spacing-4));
  }
  > [data-review-meta] { order: 3; }
  > [data-review-badge] { order: 4; }
  > [data-review-link] { order: 5; flex: 0 0 100%; justify-content: flex-start; margin-inline-start: calc(-1 * var(--gh-spacing-1)); }
  ${media.desktop} {
    > h2 { flex: 0 1 auto; }
    > [data-review-badge] { order: 1; margin-inline-start: calc(-1 * var(--gh-spacing-1_5)); }
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
  gap: var(--gh-spacing-2);
  margin-block: calc(-1 * var(--gh-spacing-1_5)) var(--gh-spacing-1_5);
  ${media.desktop} { order: 9; flex: 0 0 auto; margin: 0 0 0 auto; > [data-review-back] { display: none; } }
`;
export const ReviewBack = styled(TextAction)`
  gap: var(--gh-spacing-1);
  padding-inline: 0 var(--gh-spacing-2);
`;
export const Stepper = styled.div`
  display: inline-flex;
  align-items: center;
  margin-inline-start: auto;
  ${panelLook}
  > button {
    display: grid;
    place-items: center;
    inline-size: var(--form-control-height);
    block-size: var(--form-control-height);
    padding: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.surface};
    color: ${({ theme }) => theme.color.link};
    background: none;
    cursor: pointer;
    > svg { font-size: var(--gh-font-title); }
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
    ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  }
  > span { padding: 0 var(--gh-spacing-0_5); font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  ${media.desktop} { border-radius: ${({ theme }) => theme.radius.control}; > button { border-radius: ${({ theme }) => theme.radius.control}; } > span { padding-inline: var(--gh-spacing-1); font-size: var(--gh-font-secondary); } }
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
  min-block-size: var(--gh-size-5);
  padding: 0 var(--gh-spacing-1_75);
  border-radius: ${({ theme }) => theme.radius.small};
  color: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].text};
  background: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].background};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: var(--gh-leading-solid);
  white-space: nowrap;
`;

const zonePadding = "var(--gh-spacing-3_5)";
const zoneBody = css`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-3);
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
    > * + * { border-inline-start: 0; }
    ${({ $proof }) => $proof && css`> :last-child { grid-column: 1 / -1; border-inline-start: 0; border-block-start: 0; }`}
  }
  @media (min-width: ${({ theme }) => theme.viewport[73]}) {
    ${({ $proof }) => $proof && css`
      grid-template-columns: minmax(var(--gh-size-64), 1.15fr) minmax(var(--gh-size-60), 1fr) minmax(var(--gh-size-68), var(--gh-size-80));
      > :last-child { grid-column: auto; border-inline-start: 0; border-block-start: 0; }
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
    gap: var(--gh-spacing-2);
    padding-block-end: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.surface};
  }
  ${media.desktop} { padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5); }
`;
export const ProofFrame = styled.div<{ $clipped: boolean }>`
  inline-size: 100%;
  max-inline-size: var(--gh-size-75);
  min-inline-size: 0;
  ${media.belowDesktop} {
    max-inline-size: var(--gh-size-70);
    ${({ $clipped }) => $clipped && css`
      max-block-size: var(--gh-size-46);
      overflow: hidden;
      mask-image: linear-gradient(currentColor 72%, transparent);
    `}
  }
`;
export const ProofImage = styled.img`
  display: block;
  inline-size: 100%;
  block-size: auto;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  background: ${({ theme }) => theme.color.surface};
  ${media.desktop} { inline-size: auto; max-inline-size: 100%; max-block-size: var(--gh-size-120); margin-inline: auto; object-fit: contain; }
`;
/** Phones show "Open full size" once the clipped screenshot is enlarged (or when nothing is clipped). */
export const ProofActions = styled.div<{ $hideLink: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0 var(--gh-spacing-4);
  ${media.belowDesktop} { > a { ${({ $hideLink }) => $hideLink && css`display: none;`} } }
`;
export const ProofToggle = styled(TextAction)`font-size: ${({ theme }) => theme.typography.scale.body}; ${phoneOnly}`;

export const ExpectedZone = styled.section`
  ${zoneBody}
  ${media.belowDesktop} { ${panelLook} }
  ${media.desktop} { padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5); }
  > dl { border-block-start: 0; }
`;
export const BigAmount = styled.div`
  display: grid;
  gap: var(--gh-spacing-0_5);
  min-inline-size: 0;
  > strong { font-size: var(--gh-font-display); line-height: var(--gh-leading-control); font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: var(--gh-tracking-compact); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  > span { color: ${({ theme }) => theme.color.outcome.pending.text}; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  ${media.desktop} { > strong { font-size: var(--gh-font-displayLarge); } }
`;
export const NetworkValue = styled.dd`
  && { display: inline-flex; align-items: center; justify-content: flex-end; gap: var(--gh-spacing-1_5); }
`;
export const PaymentWarnings = styled.div`
  display: grid;
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border-radius: ${({ theme }) => theme.radius.surface};
  color: ${({ theme }) => theme.color.outcome.pending.text};
  background: ${({ theme }) => theme.color.outcome.pending.background};
  > p { display: flex; align-items: flex-start; gap: var(--gh-spacing-2); margin: 0; font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; overflow-wrap: anywhere; }
  > p > svg { flex: none; margin-block-start: var(--gh-spacing-0_5); font-size: var(--gh-font-section); }
`;
export const CheckList = styled.ul`
  display: grid;
  gap: var(--gh-spacing-1_5);
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: flex; align-items: flex-start; gap: var(--gh-spacing-2); font-size: ${({ theme }) => theme.typography.scale.body}; line-height: var(--gh-leading-reading); overflow-wrap: anywhere; }
  > li > svg { flex: none; margin-block-start: var(--gh-spacing-0_25); font-size: var(--gh-font-section); color: ${({ theme }) => theme.color.mutedText}; }
  > li[data-tone="good"] > svg { color: ${({ theme }) => theme.color.outcome.correct.text}; }
`;

/** A drawer inside a zone: hairline above, flush with the zone's text; on phones it spans the panel edge to edge. */
export const ZoneDrawer = styled(Drawer)`
  border-block-end: 0;
  border-block-start: 0;
  &:last-child { border-block-end: 0; }
  > summary { min-block-size: var(--form-control-height); padding: 0 ${zonePadding}; }
  > summary > svg:last-child { color: ${({ theme }) => theme.color.mutedText}; }
  > div { padding: var(--gh-spacing-0_5) ${zonePadding} var(--gh-size-3_5); }
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
  > svg { font-size: var(--gh-font-title); }
`;

/** Desktop: the decision column; phones: no box, so its panels and the decision bar join the review stack. */
export const DecisionZone = styled.div`
  min-inline-size: 0;
  ${media.belowDesktop} { display: contents; }
  ${media.desktop} {
    display: grid;
    align-content: start;
    gap: var(--gh-spacing-3);
    padding: var(--gh-spacing-4) var(--gh-spacing-4_5) var(--gh-spacing-4_5);
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
  ${media.belowDesktop} { > button { min-inline-size: 0; padding-inline: var(--gh-spacing-2_5); } }
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
    background: ${theme.color.outcome.incorrect.background};

  `}
`;
export const CopyRow = styled.dd`
  && { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0 var(--gh-spacing-2); }
  > span { overflow-wrap: anywhere; }
`;
export const RecoveryStack = styled.div`
  display: grid;
  gap: var(--gh-spacing-3);
  min-inline-size: 0;
  h3 { font-size: var(--gh-font-reading); }
`;
