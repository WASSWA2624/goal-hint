"use client";

import styled from "styled-components";
import { slipDisclosureIndicator, slipHeaderActionMetrics } from "../slip-disclosure-styles";
import { joinedSlipSelections } from "../joined-slip-styles";

/** A full-row link leaves the compact content with one generous, predictable analysis target. */
export const MatchRow = styled.div`
  position: relative; display: grid; align-items: center; min-inline-size: 0; min-block-size: var(--gh-size-11);
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas: "teams teams teams" "meta meta kickoff" "pick odds probability";
  gap: var(--gh-spacing-0_75) var(--gh-spacing-2); padding: var(--gh-spacing-1_75) var(--gh-spacing-2_25); color: ${({ theme }) => theme.color.text}; text-decoration: none;
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-label); overflow-wrap: anywhere;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); z-index: var(--gh-layer-content); }
  @media (hover: hover) { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  > * { min-inline-size: 0; }
  [data-teams] { grid-area: teams; display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--gh-spacing-0_5) var(--gh-spacing-1_25); margin: 0; font-size: var(--gh-font-body); line-height: var(--gh-leading-label); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-versus] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-meta] { grid-area: meta; display: flex; flex-wrap: wrap; gap: var(--gh-spacing-0_25) var(--gh-spacing-1_25); color: ${({ theme }) => theme.color.mutedText}; }
  [data-country] { &::before { content: "· "; } }
  [data-kickoff] { grid-area: kickoff; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--gh-spacing-0_25) var(--gh-spacing-1_25); color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
  [data-clock] { white-space: nowrap; }
  [data-pick] { grid-area: pick; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gh-spacing-0_5) var(--gh-spacing-1_25); }
  [data-market-label] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-pick-label] { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-body); }
  [data-leg-odds], [data-leg-probability] { display: flex; flex-direction: column; align-items: flex-end; gap: var(--gh-spacing-0_25); font-variant-numeric: tabular-nums; }
  [data-leg-odds] { grid-area: odds; }
  [data-leg-probability] { grid-area: probability; }
  [data-number-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
  [data-leg-odds] strong, [data-leg-probability] strong { font-size: var(--gh-font-body); }
  [data-result] { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: var(--gh-spacing-1_25); font-size: var(--gh-font-secondary); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  &[data-outcome="correct"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  &[data-outcome="incorrect"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  &[data-outcome="void"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.void.text}; }
  [data-leg-number], [data-analysis-arrow] { display: none; }
`;

export const CompactCard = styled.article`
  ${slipHeaderActionMetrics}
  --slip-header-action-gap: var(--gh-spacing-2_5);
  --slip-edge: ${({ theme }) => theme.phoneCardFrame.mobileHeader};
  --slip-inner-radius: ${({ theme }) => `max(0px, calc(${theme.radius.surface} - ${theme.phoneCardFrame.ruleWidth}))`};
  --slip-inner-radius-end: ${({ theme }) => `max(0px, calc(${theme.radius.surface} - ${theme.border.strong}))`};
  min-inline-size: 0; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.phoneCardFrame.inset};
  border-style: solid;
  border-block-start: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.phoneCardFrame.separator};
  border-inline: ${({ theme }) => theme.border.strong} solid var(--slip-edge);
  border-block-end: ${({ theme }) => theme.border.strong} solid var(--slip-edge);
  border-radius: ${({ theme }) => theme.radius.surface};
  container: compact-slip / inline-size;
  /* Paint joined headers inside the outer curve without clipping focus or tooltips. */
  > details { border-radius: var(--slip-inner-radius); }
  /* Native disclosure slots do not reliably inherit non-inherited corner properties. */
  [data-slip-summary] { border-start-start-radius: var(--slip-inner-radius); border-start-end-radius: var(--slip-inner-radius); }
  > details:not([open]) > [data-slip-summary], > header[data-slip-summary], [data-slip-content] {
    border-end-start-radius: var(--slip-inner-radius-end); border-end-end-radius: var(--slip-inner-radius-end);
  }
  details { min-inline-size: 0; }
  [data-slip-summary]:not([data-mobile-slip-header]) {
    position: relative; display: grid; align-items: center; min-inline-size: 0; min-block-size: var(--gh-size-11);
    grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "identity identity count" "odds average average";
    gap: var(--gh-spacing-1) var(--gh-spacing-2_5); padding: var(--gh-spacing-2) var(--gh-spacing-6_75) var(--gh-spacing-2) var(--gh-spacing-2_25); cursor: pointer; list-style: none; font-size: var(--gh-font-caption); line-height: var(--gh-leading-label);
    background: ${({ theme }) => theme.color.cardHeader}; overflow-wrap: anywhere;
    &::-webkit-details-marker { display: none; }
    &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
    > * { min-inline-size: 0; }
  }
  header[data-slip-summary]:not([data-mobile-slip-header]) { cursor: default; padding-inline-end: var(--gh-spacing-2_25); border-block-end: 0; }
  [data-summary-identity] { grid-area: identity; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_75); }
  h3 { margin: 0; font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-control); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  [data-rank] { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-micro); font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-summary-fact] { display: flex; align-items: baseline; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_25); flex-wrap: wrap; font-variant-numeric: tabular-nums; }
  [data-summary-fact] strong { font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-control); font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  [data-fact-label], [data-summary-count] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-summary-odds] { grid-area: odds; }
  [data-summary-average] { grid-area: average; justify-self: end; }
  [data-summary-count] { grid-area: count; justify-self: end; }
  [data-summary-status] { grid-column: 1 / -1; justify-self: end; }
  [data-toggle-chevron] {
    ${slipDisclosureIndicator}
    position: absolute; inset-inline-end: var(--gh-spacing-2_5); inset-block-start: var(--gh-spacing-2);
    inline-size: var(--gh-size-6); block-size: var(--gh-size-6); transform: none;
  }
  details[open] > summary { border-block-end: 0; }
  details[open] [data-toggle-chevron] { --slip-chevron-rotation: 45deg; }
  ul { list-style: none; display: grid; margin: 0; padding: 0; min-inline-size: 0; }
  li { min-inline-size: 0; }
  li + li { border-block-start: 0; }

  &[data-compact-slip="clean-ledger"] [data-slip-summary]:not([data-mobile-slip-header]) { padding-block: var(--gh-spacing-1); row-gap: var(--gh-spacing-0_5); }
  @container compact-slip (max-width: ${({ theme }) => theme.viewport[12]}) {
    &[data-compact-slip="clean-ledger"] [data-slip-summary]:not([data-mobile-slip-header]) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "identity" "count" "odds" "average";
      row-gap: var(--gh-spacing-1);
    }
    &[data-compact-slip="clean-ledger"] [data-summary-count],
    &[data-compact-slip="clean-ledger"] [data-summary-average] { justify-self: start; }
  }

  /* 01: one broad fixture line followed by compact supporting rows. */
  &[data-compact-slip="inline-ledger"] {
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1); }
  }

  /* 02: fixed fact rails beside stacked identity and team columns. */
  &[data-compact-slip="split-rail"] {
    summary { grid-template-columns: minmax(0, 1fr) minmax(var(--gh-size-14), auto) minmax(var(--gh-size-19), auto); grid-template-areas: "identity odds average" "count odds average"; gap: var(--gh-spacing-0_75) var(--gh-spacing-2_25); }
    [data-summary-identity] { flex-direction: column; align-items: flex-start; gap: var(--gh-spacing-0_5); }
    [data-summary-count] { justify-self: start; }
    [data-summary-fact] { flex-direction: column-reverse; align-items: flex-end; gap: var(--gh-spacing-0_5); }
    [data-summary-average] [data-fact-label] { max-inline-size: var(--gh-size-21); text-align: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "teams pick pick" "meta odds probability" "kickoff odds probability"; }
    ${MatchRow} [data-teams] { flex-direction: column; gap: var(--gh-spacing-0_25); }
    ${MatchRow} [data-versus] { display: none; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-pick] { justify-content: flex-end; max-inline-size: var(--gh-size-36); justify-self: end; }
  }

  /* 03: total odds and each selection's price form a strong right-hand anchor. */
  &[data-compact-slip="odds-anchor"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count odds" "average odds"; gap: var(--gh-spacing-0_75) var(--gh-spacing-2_5); }
    [data-summary-count], [data-summary-average] { justify-self: start; }
    [data-summary-odds] { flex-direction: column-reverse; align-items: flex-end; padding-inline-start: var(--gh-spacing-3); border-inline-start: 0; }
    [data-summary-odds] strong { font-size: var(--gh-font-page); }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams odds" "meta odds" "kickoff odds" "pick probability"; gap: var(--gh-spacing-0_5) var(--gh-spacing-2_25); }
    ${MatchRow} [data-leg-odds] { padding-inline-start: var(--gh-spacing-2_25); border-inline-start: 0; }
    ${MatchRow} [data-leg-odds] strong { font-size: var(--gh-font-subheading); }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1); }
  }

  /* 04: the numbered ticket gutter is shared by the summary and fixture strips. */
  &[data-compact-slip="ticket-strip"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity count" "odds average"; border-inline-start: 0; }
    [data-summary-fact] { gap: var(--gh-spacing-0_75); }
    ${MatchRow} { grid-template-columns: var(--gh-size-4) minmax(0, 1fr) auto auto; grid-template-areas: "number teams teams teams" "number meta meta kickoff" "number pick odds probability"; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5); }
    ${MatchRow} [data-leg-number] { grid-area: number; display: block; align-self: stretch; padding-block-start: var(--gh-spacing-0_25); color: ${({ theme }) => theme.color.mutedText}; border-inline-end: 0; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-0_75); }
  }

  /* 05: three equal metric cells make values line up across different slips. */
  &[data-compact-slip="compact-grid"] {
    summary { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: "identity identity identity" "odds average count"; gap: var(--gh-spacing-1_75) 0; padding-inline-end: var(--gh-spacing-2_25); }
    [data-summary-fact] { flex-direction: column-reverse; align-items: center; justify-self: stretch; gap: var(--gh-spacing-0_5); text-align: center; }
    [data-summary-average], [data-summary-count] { border-inline-start: 0; }
    [data-summary-count] { justify-self: stretch; align-self: stretch; display: grid; place-content: center; text-align: center; padding-inline: var(--gh-spacing-1); }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) minmax(var(--gh-size-13), auto) minmax(var(--gh-size-18), auto); grid-template-areas: "teams teams teams" "meta meta kickoff" "pick odds probability"; gap: var(--gh-spacing-1_25) var(--gh-spacing-1_5); }
    ${MatchRow} [data-pick], ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { border-block-start: 0; padding-block-start: var(--gh-spacing-1); align-self: stretch; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { align-items: center; border-inline-start: 0; }
  }

  /* 06: selected outcomes lead; this differs from fixture-first ledgers. */
  &[data-compact-slip="pick-first"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity average" "count odds"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    [data-summary-average] { flex-direction: column-reverse; align-items: flex-end; gap: var(--gh-spacing-0_25); }
    ${MatchRow} { grid-template-columns: minmax(var(--gh-size-15), 0.8fr) minmax(0, 2fr) auto; grid-template-areas: "pick teams teams" "pick meta meta" "pick kickoff kickoff" "pick odds probability"; gap: var(--gh-spacing-0_5) var(--gh-spacing-1_75); }
    ${MatchRow} [data-pick] { flex-direction: column-reverse; align-items: flex-start; justify-content: center; align-self: stretch; padding-inline-end: var(--gh-spacing-1_75); border-inline-end: 0; }
    ${MatchRow} [data-pick-label] { font-size: var(--gh-font-section); }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-0_75); }
    ${MatchRow} [data-leg-odds] { justify-self: start; }
  }

  /* 07: stacked participants leave stable columns for all numerical values. */
  &[data-compact-slip="fixture-ledger"] {
    summary { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "identity odds average" "count odds average"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-identity] { flex-direction: column; align-items: flex-start; gap: var(--gh-spacing-0_5); }
    [data-summary-fact] { flex-direction: column; align-items: flex-end; gap: var(--gh-spacing-0_5); }
    [data-summary-average] [data-fact-label] { max-inline-size: var(--gh-size-20); text-align: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "teams odds probability" "pick odds probability" "meta meta meta" "kickoff kickoff kickoff"; gap: var(--gh-spacing-0_5) var(--gh-spacing-2); }
    ${MatchRow} [data-teams] { flex-direction: column; gap: var(--gh-spacing-0_25); }
    ${MatchRow} [data-versus] { display: none; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { align-self: stretch; justify-content: center; padding-inline-start: var(--gh-spacing-1_75); border-inline-start: 0; }
  }

  /* 08: average and individual probabilities receive the primary vertical rail. */
  &[data-compact-slip="probability-rail"] {
    summary { grid-template-columns: minmax(var(--gh-size-19), auto) minmax(0, 1fr) auto; grid-template-areas: "average identity identity" "average count odds"; gap: var(--gh-spacing-1) var(--gh-spacing-2_5); }
    [data-summary-average] { align-self: stretch; justify-self: stretch; flex-direction: column-reverse; align-items: flex-start; justify-content: center; gap: var(--gh-spacing-0_5); padding-inline-end: var(--gh-spacing-2_25); border-inline-end: 0; }
    [data-summary-average] [data-fact-label] { max-inline-size: var(--gh-size-20); }
    [data-summary-average] strong { font-size: var(--gh-font-lead); }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams probability" "meta probability" "kickoff probability" "pick odds"; gap: var(--gh-spacing-0_5) var(--gh-spacing-2); }
    ${MatchRow} [data-leg-probability] { align-self: stretch; justify-content: center; border-inline-start: 0; padding-inline-start: var(--gh-spacing-2_25); }
    ${MatchRow} [data-leg-probability] strong { font-size: var(--gh-font-section); }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1); }
  }

  /* 09: a narrow kickoff gutter establishes an explicit time-based reading order. */
  &[data-compact-slip="timeline"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count average"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    ${MatchRow} { grid-template-columns: var(--gh-size-18) minmax(0, 1fr) auto; grid-template-areas: "kickoff teams teams" "kickoff meta meta" "kickoff pick pick" "kickoff odds probability"; gap: var(--gh-spacing-0_5) var(--gh-spacing-2); }
    ${MatchRow} [data-kickoff] { flex-direction: column-reverse; justify-content: flex-end; align-self: stretch; gap: var(--gh-spacing-0_5); padding-inline-end: var(--gh-spacing-1_75); border-inline-end: 0; }
    ${MatchRow} [data-clock] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; white-space: normal; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1); }
    ${MatchRow} [data-leg-odds] { justify-self: start; }
  }

  /* 10: corresponding fixture/price and metadata/probability pairs share each line. */
  &[data-compact-slip="paired-lines"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count average"; gap: var(--gh-spacing-1_75) var(--gh-spacing-2_5); }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; flex-direction: row-reverse; }
    [data-summary-average] { flex-direction: row-reverse; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams odds" "pick probability" "meta kickoff"; gap: var(--gh-spacing-1_25) var(--gh-spacing-2_5); }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: var(--gh-spacing-1); }
    ${MatchRow} [data-leg-odds] { flex-direction: row-reverse; }
    ${MatchRow} [data-kickoff] { max-inline-size: var(--gh-size-28); }
  }

  /* Very narrow or enlarged text layouts retain every value and never force a fixed-width rail. */
  @media (max-width: ${({ theme }) => theme.viewport[20]}) {
    summary { column-gap: var(--gh-spacing-1_75); padding-inline-start: var(--gh-spacing-1_75); }
    [data-summary-fact] strong { font-size: var(--gh-font-body); }
    ${MatchRow} { padding-inline: var(--gh-spacing-1_75); column-gap: var(--gh-spacing-1_5); }
  }
  @container (max-width: ${({ theme }) => theme.viewport[20]}) {
    summary { column-gap: var(--gh-spacing-1_75); padding-inline-start: var(--gh-spacing-1_75); }
    [data-summary-fact] strong { font-size: var(--gh-font-body); }
    ${MatchRow} { padding-inline: var(--gh-spacing-1_75); column-gap: var(--gh-spacing-1_5); }
  }
  ${joinedSlipSelections}
`;
