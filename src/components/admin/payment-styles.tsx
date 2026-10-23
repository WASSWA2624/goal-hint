"use client";

import styled from "styled-components";
import { Panel } from "@/components/analytics/dashboard/dashboard-styles";
import { ActionButton } from "./admin-form";

export const PaymentLayout = styled.div`
  display: grid; gap: 14px; min-inline-size: 0;
  button, input, textarea, select { border-radius: 0; }
`;

export const PaymentFeedback = styled.div`
  scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
  > p { margin: 0; }
`;

export const PaymentTabs = styled.nav`
  display: flex; flex-wrap: wrap; gap: 4px; min-inline-size: 0;
  a { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-block-size: 44px; padding: 8px 14px;
    border: 1px solid ${({ theme }) => theme.color.border}; border-radius: 0; color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.surface}; font-size: 0.8125rem; font-weight: 500; text-decoration: none; }
  a[aria-current="page"] { border-color: ${({ theme }) => theme.color.link}; color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; }
  a[aria-disabled="true"] { cursor: not-allowed; opacity: 0.6; }
  a:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;

export const PaymentToolbar = styled(Panel)<{ $reviewing: boolean }>`
  display: grid; gap: 10px; padding: 14px; border-radius: 0;
  @media(min-width: 1000px) { grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 20px; }
  @media(max-width: 999px) { display: ${({ $reviewing }) => $reviewing ? "none" : "grid"}; }
  label { font-size: 0.8125rem; }
  input:not([type="checkbox"], [type="radio"], [type="hidden"]), select { min-block-size: 44px; font-size: 16px; }
  button { min-block-size: 44px; }
`;

export const PaymentWorkspace = styled.div<{ $detailOpen: boolean }>`
  display: grid; gap: 16px; min-inline-size: 0; align-items: start;
  > * { min-inline-size: 0; }
  @media(min-width: 1000px) { grid-template-columns: minmax(18rem, 23rem) minmax(0, 1fr); }
  @media(max-width: 999px) {
    > aside { display: ${({ $detailOpen }) => $detailOpen ? "none" : "grid"}; }
    > section { display: ${({ $detailOpen }) => $detailOpen ? "grid" : "none"}; }
  }
`;

export const QueuePanel = styled.aside`
  display: grid; align-content: start; gap: 0; min-inline-size: 0;
  border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
`;

export const QueueHeading = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; padding: 12px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border}; font-size: 0.8125rem;
  h2, p { margin: 0; font-size: inherit; }
`;

export const QueueList = styled.div`
  display: grid; align-content: start; min-inline-size: 0;
  @media(min-width: 1000px) { max-block-size: calc(100dvh - 22rem); overflow: auto; overscroll-behavior: contain; }
`;

export const QueueItem = styled.button<{ $selected: boolean }>`
  display: grid; gap: 8px; inline-size: 100%; min-inline-size: 0; min-block-size: 44px; padding: 12px;
  border: 0; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  border-inline-start: 3px solid ${({ theme, $selected }) => $selected ? theme.color.link : "transparent"}; border-radius: 0;
  background: ${({ theme, $selected }) => $selected ? theme.color.brandSoft : theme.color.surface};
  color: ${({ theme }) => theme.color.text}; font: inherit; text-align: start; cursor: pointer;
  &:last-child { border-block-end: 0; }
  &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
  > header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; min-inline-size: 0; }
  > header strong { font-size: 0.875rem; font-weight: 600; overflow-wrap: anywhere; }
  > header > :last-child:not(:first-child) { font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  > div { display: grid; gap: 4px; min-inline-size: 0; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; overflow-wrap: anywhere; }
`;

export const QueueMeta = styled.div`
  && { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem;
  span { display: inline-flex; align-items: center; gap: 4px; min-inline-size: 0; }
  svg { inline-size: 15px; block-size: 15px; flex: none; }
`;

const statusTone = (status: string) => status === "pending" ? "pending" : status === "approved" ? "correct" : status === "rejected" ? "incorrect" : "void";
export const PaymentBadge = styled.span<{ $status: string }>`
  display: inline-flex; align-items: center; justify-content: center; padding: 2px 6px; border-radius: 0;
  background: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].background};
  color: ${({ theme, $status }) => theme.color.outcome[statusTone($status)].text}; font-size: 0.6875rem; line-height: 1.4; font-weight: 500;
`;

export const ReviewPanel = styled.section`
  display: grid; gap: 12px; min-inline-size: 0;
  scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px);
`;

export const PaymentCard = styled(Panel)`
  display: grid; gap: 14px; padding: 16px; min-inline-size: 0; border-radius: 0;
  h2, h3, p { margin: 0; }
  h3 { font-size: 0.875rem; }
  label { font-size: 0.8125rem; }
  input:not([type="checkbox"], [type="radio"], [type="hidden"]), textarea, select { min-block-size: 44px; font-size: 16px; }
  button { min-block-size: 44px; }
  label:has(> input[type="checkbox"]) { display: flex; align-items: center; gap: 8px; min-block-size: 44px; cursor: pointer; }
  input[type="checkbox"] { inline-size: 18px; block-size: 18px; margin: 0; flex: none; }
  form, fieldset { min-inline-size: 0; }
  details > summary { display: flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: 0.8125rem; cursor: pointer; overflow-wrap: anywhere; }
  details > summary:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;

export const ReviewHeader = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-inline-size: 0;
  h2 { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
  h2 { scroll-margin-block-start: calc(var(--app-header-content-height, 4rem) + 16px); }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
`;

export const PaymentFacts = styled.dl`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-inline-size: 0; margin: 0;
  > div { display: grid; align-content: start; gap: 4px; min-inline-size: 0; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  dd { min-inline-size: 0; margin: 0; font-size: 0.875rem; font-weight: 500; overflow-wrap: anywhere; }
  button { justify-self: start; }
  @media(min-width: 1200px) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
`;

export const PaymentEvidence = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; min-inline-size: 0;
  > a, > span { display: inline-flex; align-items: center; min-block-size: 44px; }
  > details { min-inline-size: 0; }
  > details[open] { flex: 1 1 100%; }
`;

export const ApprovalFooter = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; min-inline-size: 0;
  > label { flex: 1 1 14rem; }
  > button { flex: 1 1 12rem; min-block-size: 44px; }
  > span { flex: 1 1 100%; }
`;

export const PaymentHighlight = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px;
  min-inline-size: 0; background: ${({ theme }) => theme.color.brandSoft};
  strong { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  span { font-size: 0.8125rem; overflow-wrap: anywhere; }
`;

export const PaymentWarnings = styled.div`
  display: grid; gap: 6px; min-inline-size: 0;
  > p { margin: 0; color: ${({ theme }) => theme.color.outcome.pending.text}; font-size: 0.75rem; overflow-wrap: anywhere; }
`;

export const CheckDetails = styled.details`
  min-inline-size: 0;
  > summary { display: flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: 0.8125rem; cursor: pointer; }
  > summary:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  ul { display: grid; gap: 6px; margin: 0; padding-inline-start: 20px; font-size: 0.75rem; }
`;

export const ReceiptPreview = styled.img`display: block; max-inline-size: 100%; max-block-size: 22rem; object-fit: contain;`;

export const ReviewActions = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; min-inline-size: 0;
  > button { flex: 1; min-block-size: 44px; border-radius: 0; }
`;

export const PaymentEmpty = styled.div`
  display: grid; justify-items: center; align-content: center; gap: 10px; padding: 24px; min-block-size: 180px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; text-align: center;
  h2, p { margin: 0; }
  > svg { inline-size: 28px; block-size: 28px; }
`;

export const ReviewBack = styled(ActionButton)`display: inline-flex; justify-self: start; @media(min-width: 1000px) { display: none; }`;

export const TrialPanel = styled.details`
  min-inline-size: 0; padding: 12px; border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface};
  > summary { display: flex; align-items: center; gap: 8px; min-block-size: 44px; font-size: 0.875rem; cursor: pointer; }
  > summary:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  > div { display: grid; gap: 12px; min-inline-size: 0; }
`;
