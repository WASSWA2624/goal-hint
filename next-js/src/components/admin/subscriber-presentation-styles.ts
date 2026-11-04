"use client";

import { css } from "styled-components";
import { media } from "@/styles/theme";
import { RecordBody, RecordHead } from "./record-workspace";

/** Approved Balanced compact presentation, shared by the live workspace and studies. */
export const subscriberPresentation = css`
  > ${RecordHead}:not([data-admin-toolbar]) { display: flex; justify-content: space-between; }
  > ${RecordHead}:not([data-admin-toolbar]) > h1 { position: static; inline-size: auto; block-size: auto; margin: 0; padding: 0; overflow: visible; clip: auto; clip-path: none; white-space: normal; }
  > ${RecordHead}:not([data-admin-toolbar]) > button { display: inline-flex; margin-inline-start: auto; }
  [data-subscriber-review-filters] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2); min-inline-size: 0; padding-block: var(--gh-spacing-0_75); }
  [data-subscriber-review-filters] > :first-child { grid-column: 1 / -1; }
  [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-inline-size: 0; inline-size: 100%; border-radius: ${({ theme }) => theme.radius.control}; }
  [data-review-network] { display: grid; place-items: center; inline-size: var(--gh-size-7_5); min-inline-size: 0; }
  [data-review-network] > svg { inline-size: var(--gh-size-5_5); block-size: var(--gh-size-5_5); color: ${({ theme }) => theme.color.mutedText}; }
  [data-review-network] [data-payment-logo] { inline-size: var(--gh-size-7); block-size: var(--gh-size-5_5); }
  [data-review-phone] { font-variant-numeric: tabular-nums; }
  [data-subscriber-detail] { container: subscriber-detail / inline-size; }
  [data-subscriber-detail] ${RecordBody} { gap: var(--gh-spacing-2); }
  [data-subscriber-summary] { padding: 0; border: 0; background: ${({ theme }) => theme.color.surface}; }
  [data-subscriber-summary] > header { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--gh-spacing-1_5) var(--gh-spacing-2_5); }
  [data-subscriber-summary] > header h2 { display: flex; align-items: center; gap: var(--gh-spacing-2); margin: 0; font-size: var(--gh-font-subheading); line-height: var(--gh-leading-caption); }
  [data-subscriber-summary] > header > div { min-inline-size: 0; }
  [data-subscriber-summary] > header p { margin: 0; font-size: var(--gh-font-caption); }
  [data-subscriber-summary] > header > p { gap: var(--gh-spacing-1); }
  [data-subscriber-summary] [data-payment-logo] { inline-size: var(--gh-size-7); block-size: var(--gh-size-5); }
  [data-subscriber-stats] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
  [data-subscriber-stats] > div { display: grid; gap: var(--gh-spacing-0_5); padding: var(--gh-spacing-1_75) var(--gh-spacing-2_5); min-inline-size: 0; }
  [data-subscriber-stats] dt { font-size: var(--gh-font-micro); line-height: var(--gh-leading-compact); color: ${({ theme }) => theme.color.mutedText}; }
  [data-subscriber-stats] dd { margin: 0; font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-label); font-weight: var(--gh-weight-heavy); font-variant-numeric: tabular-nums; }
  [data-subscriber-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-2) var(--gh-spacing-3); }
  [data-subscriber-actions] > button { flex: 0 1 auto; inline-size: auto; min-inline-size: 0; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2); font-size: var(--gh-font-secondary); line-height: var(--gh-leading-heading); }
  [data-subscriber-actions] > button:first-child { grid-column: auto; }
  [data-subscriber-actions] > button > svg { inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); }
  [data-subscriber-tabs] { display: flex; flex-wrap: nowrap; align-items: stretch; justify-self: stretch; gap: 0; inline-size: 100%; padding: 0; border: 0; border-block-end: 0; background: ${({ theme }) => theme.color.surface}; overflow-x: auto; }
  [data-subscriber-tabs] > button { flex: 0 0 auto; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_5) var(--gh-spacing-3); border: 0; border-block-end: 0; color: ${({ theme }) => theme.color.mutedText}; background: transparent; font-size: var(--gh-font-secondary); white-space: nowrap; }
  [data-subscriber-tabs] > button[aria-selected="true"] { color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};  }
  [data-subscriber-tab] { min-inline-size: 0; }
  [data-subscriber-tab] > div { gap: var(--gh-spacing-2_5); padding: var(--gh-spacing-3); }

  ${media.desktop} {
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: var(--form-control-height); }
    &[data-subscriber-workspace] [data-subscriber-summary] { background: transparent; }
    &[data-subscriber-workspace] [data-subscriber-stats] { margin: var(--gh-spacing-3) ${({ theme }) => theme.layout.sectionPadding} 0; }
    &:not([data-subscriber-workspace]) [data-subscriber-detail] ${RecordBody} { padding: var(--gh-spacing-3); }
    &:not([data-subscriber-workspace]) [data-subscriber-summary] > header { padding: var(--gh-spacing-2_5) var(--gh-spacing-3); min-block-size: 0; }
  }
  @container subscriber-detail (max-width: ${({ theme }) => theme.viewport[30]}) {
    [data-subscriber-stats] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  ${media.belowDesktop} {
    &:not([data-record-compact]) [data-record-list-scroll] { max-block-size: var(--gh-size-96); overflow-y: auto; }
    [data-subscriber-review-filters] { gap: var(--gh-spacing-2_5); }
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: var(--form-control-height); font-size: var(--gh-font-section); }
    [data-subscriber-detail] ${RecordBody} { padding: 0; gap: var(--gh-spacing-2_5); }
    &[data-subscriber-workspace] [data-subscriber-summary] { margin-block-end: var(--gh-spacing-2_5); }
    [data-subscriber-summary] > header { padding: var(--gh-spacing-2_5); align-items: start; }
    [data-subscriber-stats] > div { padding: var(--gh-spacing-1_75) var(--gh-spacing-2_25); }
    [data-subscriber-actions] { gap: var(--gh-spacing-1_25); padding: var(--gh-spacing-2); }
    [data-subscriber-actions] > button { flex: 1 1 auto; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1_75); }
    [data-subscriber-tabs] > button { min-block-size: var(--form-control-height); padding-inline: var(--gh-spacing-2_5); }
  }
  @media (pointer: coarse) {
    [data-subscriber-actions] > button, [data-subscriber-tabs] > button,
    [data-subscriber-review-filters] input, [data-subscriber-review-filters] select { min-block-size: var(--form-control-height); }
  }
`;
