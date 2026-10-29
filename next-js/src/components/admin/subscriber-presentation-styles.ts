"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";
import { RecordBody, RecordHead } from "./record-workspace";

/** Approved Balanced compact presentation, shared by the live workspace and studies. */
export const subscriberPresentation = css`
  button, input, select, textarea, section, article, form, [role="group"], [role="tabpanel"] { border-radius: 0; }
  > ${RecordHead} { display: flex; justify-content: space-between; }
  > ${RecordHead} > h1 { position: static; inline-size: auto; block-size: auto; margin: 0; padding: 0; overflow: visible; clip: auto; clip-path: none; white-space: normal; }
  > ${RecordHead} > button { display: inline-flex; margin-inline-start: auto; }
  [data-subscriber-review-filters] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; min-inline-size: 0; padding-block: 3px; }
  [data-subscriber-review-filters] > :first-child { grid-column: 1 / -1; }
  [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-inline-size: 0; inline-size: 100%; border-radius: 0; }
  [data-review-subscriber-row] { grid-template-columns: 30px minmax(0, 1fr) auto; gap: 3px 8px; align-items: center; border-radius: 0; }
  [data-review-network] { display: grid; place-items: center; grid-column: 1; grid-row: 1 / span 2; inline-size: 30px; min-inline-size: 0; }
  [data-review-network] > svg { inline-size: 22px; block-size: 22px; color: ${({ theme }) => theme.color.mutedText}; }
  [data-review-network] [data-payment-logo] { inline-size: 28px; block-size: 22px; }
  [data-review-phone] { grid-column: 2; min-inline-size: 0; font-size: 0.8125rem; font-weight: 750; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  [data-review-row-status] { grid-column: 3; justify-self: end; font-size: 0.625rem; border-radius: 0; }
  [data-review-row-meta] { grid-column: 2 / -1; min-inline-size: 0; font-size: 0.6875rem; color: ${({ theme }) => theme.color.mutedText}; overflow-wrap: anywhere; }
  [data-subscriber-detail] { container: subscriber-detail / inline-size; }
  [data-subscriber-detail] ${RecordBody} { gap: 8px; padding: 12px; }
  [data-subscriber-summary] { padding: 0; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; }
  [data-subscriber-summary] > header { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 10px; padding: 10px 12px; min-block-size: 0; }
  [data-subscriber-summary] > header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 1.0625rem; line-height: 1.35; }
  [data-subscriber-summary] > header > div { min-inline-size: 0; }
  [data-subscriber-summary] > header p { margin: 0; font-size: 0.6875rem; }
  [data-subscriber-summary] > header > p { gap: 4px; }
  [data-subscriber-summary] [data-payment-logo] { inline-size: 28px; block-size: 20px; }
  [data-subscriber-stats] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
  [data-subscriber-stats] > div { display: grid; gap: 2px; padding: 7px 10px; min-inline-size: 0; }
  [data-subscriber-stats] dt { font-size: 0.625rem; line-height: 1.4; color: ${({ theme }) => theme.color.mutedText}; }
  [data-subscriber-stats] dd { margin: 0; font-size: 0.875rem; line-height: 1.3; font-weight: 750; font-variant-numeric: tabular-nums; }
  [data-subscriber-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; }
  [data-subscriber-actions] > button { flex: 0 1 auto; inline-size: auto; min-inline-size: 0; min-block-size: 32px; padding: 4px 8px; font-size: 0.75rem; line-height: 1.25; }
  [data-subscriber-actions] > button:first-child { grid-column: auto; }
  [data-subscriber-actions] > button > svg { inline-size: 14px; block-size: 14px; }
  [data-subscriber-tabs] { display: flex; flex-wrap: nowrap; align-items: stretch; justify-self: stretch; gap: 0; inline-size: 100%; padding: 0; border: 0; border-block-end: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface}; overflow-x: auto; }
  [data-subscriber-tabs] > button { flex: 0 0 auto; min-block-size: 34px; padding: 6px 12px; border: 0; border-block-end: 2px solid transparent; color: ${({ theme }) => theme.color.mutedText}; background: transparent; font-size: 0.75rem; white-space: nowrap; }
  [data-subscriber-tabs] > button[aria-selected="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; border-block-end-color: ${({ theme }) => theme.color.link}; }
  [data-subscriber-tab] { min-inline-size: 0; }
  [data-subscriber-tab] > div { gap: 10px; padding: 12px; }

  ${media.desktop} {
    [data-review-subscriber-row] { min-block-size: 62px; padding: 9px 10px; }
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: 36px; }
  }
  @container subscriber-detail (max-width: 30rem) {
    [data-subscriber-stats] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  ${media.belowDesktop} {
    [data-record-list-scroll] { max-block-size: 24rem; overflow-y: auto; }
    [data-review-subscriber-row] { min-block-size: 68px; padding: 10px; }
    [data-subscriber-review-filters] { gap: 10px; }
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: 44px; font-size: 1rem; }
    [data-subscriber-detail] ${RecordBody} { padding: 0; gap: 10px; }
    [data-subscriber-summary] > header { padding: 10px; align-items: start; }
    [data-subscriber-stats] > div { padding: 7px 9px; }
    [data-subscriber-actions] { gap: 5px; padding: 8px; }
    [data-subscriber-actions] > button { flex: 1 1 auto; min-block-size: 44px; padding: 7px; }
    [data-subscriber-tabs] > button { min-block-size: 44px; padding-inline: 10px; }
  }
  @media (pointer: coarse) {
    [data-subscriber-actions] > button, [data-subscriber-tabs] > button,
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: 44px; }
  }
`;
