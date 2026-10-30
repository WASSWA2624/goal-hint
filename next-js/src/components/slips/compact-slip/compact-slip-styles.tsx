"use client";

import styled from "styled-components";

/** A full-row link leaves the compact content with one generous, predictable analysis target. */
export const MatchRow = styled.div`
  position: relative; display: grid; align-items: center; min-inline-size: 0; min-block-size: 44px;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-areas: "teams teams teams" "meta meta kickoff" "pick odds probability";
  gap: 3px 8px; padding: 7px 9px; color: ${({ theme }) => theme.color.text}; text-decoration: none;
  font-size: 0.6875rem; line-height: 1.3; overflow-wrap: anywhere;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; z-index: 1; }
  @media (hover: hover) { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  > * { min-inline-size: 0; }
  [data-teams] { grid-area: teams; display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 5px; margin: 0; font-size: 0.8125rem; line-height: 1.3; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-versus] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-meta] { grid-area: meta; display: flex; flex-wrap: wrap; gap: 1px 5px; color: ${({ theme }) => theme.color.mutedText}; }
  [data-country] { &::before { content: "· "; } }
  [data-kickoff] { grid-area: kickoff; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 1px 5px; color: ${({ theme }) => theme.color.mutedText}; font-variant-numeric: tabular-nums; }
  [data-clock] { white-space: nowrap; }
  [data-pick] { grid-area: pick; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 5px; }
  [data-market-label] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-pick-label] { color: ${({ theme }) => theme.color.link}; font-size: 0.8125rem; }
  [data-leg-odds], [data-leg-probability] { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; font-variant-numeric: tabular-nums; }
  [data-leg-odds] { grid-area: odds; }
  [data-leg-probability] { grid-area: probability; }
  [data-number-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  [data-leg-odds] strong, [data-leg-probability] strong { font-size: 0.8125rem; }
  [data-result] { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 5px; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  &[data-outcome="correct"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  &[data-outcome="incorrect"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  &[data-outcome="void"] [data-outcome-label] { color: ${({ theme }) => theme.color.outcome.void.text}; }
  [data-leg-number], [data-analysis-arrow] { display: none; }
`;

export const CompactCard = styled.article`
  min-inline-size: 0; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.phoneCardFrame.border}; border-radius: ${({ theme }) => theme.radius.surface};
  container: compact-slip / inline-size;
  /* Paint joined headers inside the outer curve without clipping focus or tooltips. */
  > details { border-radius: inherit; }
  [data-slip-summary] { border-start-start-radius: inherit; border-start-end-radius: inherit; }
  > details:not([open]) > [data-slip-summary], > header[data-slip-summary] { border-end-start-radius: inherit; border-end-end-radius: inherit; }
  details { min-inline-size: 0; }
  [data-slip-summary]:not([data-mobile-slip-header]) {
    position: relative; display: grid; align-items: center; min-inline-size: 0; min-block-size: 44px;
    grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "identity identity count" "odds average average";
    gap: 4px 10px; padding: 8px 27px 8px 9px; cursor: pointer; list-style: none; font-size: 0.6875rem; line-height: 1.3;
    background: ${({ theme }) => theme.color.cardHeader}; overflow-wrap: anywhere;
    &::-webkit-details-marker { display: none; }
    &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
    > * { min-inline-size: 0; }
  }
  header[data-slip-summary]:not([data-mobile-slip-header]) { cursor: default; padding-inline-end: 9px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  [data-summary-identity] { grid-area: identity; display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 7px; }
  h3 { margin: 0; font-size: 0.875rem; line-height: 1.2; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  [data-rank] { color: ${({ theme }) => theme.color.link}; font-size: 0.625rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-summary-fact] { display: flex; align-items: baseline; gap: 3px 5px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
  [data-summary-fact] strong { font-size: 0.875rem; line-height: 1.2; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  [data-fact-label], [data-summary-count] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-summary-odds] { grid-area: odds; }
  [data-summary-average] { grid-area: average; justify-self: end; }
  [data-summary-count] { grid-area: count; justify-self: end; }
  [data-summary-status] { grid-column: 1 / -1; justify-self: end; }
  [data-toggle-chevron] { position: absolute; inset-inline-end: 10px; inset-block-start: calc(50% - 4px); inline-size: 6px; block-size: 6px; border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(45deg); }
  details[open] > summary { border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  details[open] [data-toggle-chevron] { transform: rotate(225deg); inset-block-start: calc(50% - 1px); }
  ul { list-style: none; display: grid; margin: 0; padding: 0; min-inline-size: 0; }
  li { min-inline-size: 0; }
  li + li { border-block-start: 1px solid ${({ theme }) => theme.color.border}; }

  &[data-compact-slip="clean-ledger"] [data-slip-summary]:not([data-mobile-slip-header]) { padding-block: 4px; row-gap: 2px; }
  @container compact-slip (max-width: 12rem) {
    &[data-compact-slip="clean-ledger"] [data-slip-summary]:not([data-mobile-slip-header]) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "identity" "count" "odds" "average";
      row-gap: 4px;
    }
    &[data-compact-slip="clean-ledger"] [data-summary-count],
    &[data-compact-slip="clean-ledger"] [data-summary-average] { justify-self: start; }
  }

  /* 01: one broad fixture line followed by compact supporting rows. */
  &[data-compact-slip="inline-ledger"] {
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 4px; }
  }

  /* 02: fixed fact rails beside stacked identity and team columns. */
  &[data-compact-slip="split-rail"] {
    summary { grid-template-columns: minmax(0, 1fr) minmax(3.5rem, auto) minmax(4.75rem, auto); grid-template-areas: "identity odds average" "count odds average"; gap: 3px 9px; }
    [data-summary-identity] { flex-direction: column; align-items: flex-start; gap: 2px; }
    [data-summary-count] { justify-self: start; }
    [data-summary-fact] { flex-direction: column-reverse; align-items: flex-end; gap: 2px; }
    [data-summary-average] [data-fact-label] { max-inline-size: 5.25rem; text-align: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "teams pick pick" "meta odds probability" "kickoff odds probability"; }
    ${MatchRow} [data-teams] { flex-direction: column; gap: 1px; }
    ${MatchRow} [data-versus] { display: none; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-pick] { justify-content: flex-end; max-inline-size: 9rem; justify-self: end; }
  }

  /* 03: total odds and each selection's price form a strong right-hand anchor. */
  &[data-compact-slip="odds-anchor"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count odds" "average odds"; gap: 3px 10px; }
    [data-summary-count], [data-summary-average] { justify-self: start; }
    [data-summary-odds] { flex-direction: column-reverse; align-items: flex-end; padding-inline-start: 12px; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-summary-odds] strong { font-size: 1.375rem; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams odds" "meta odds" "kickoff odds" "pick probability"; gap: 2px 9px; }
    ${MatchRow} [data-leg-odds] { padding-inline-start: 9px; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
    ${MatchRow} [data-leg-odds] strong { font-size: 1.0625rem; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 4px; }
  }

  /* 04: the numbered ticket gutter is shared by the summary and fixture strips. */
  &[data-compact-slip="ticket-strip"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity count" "odds average"; border-inline-start: 4px solid ${({ theme }) => theme.color.brand}; }
    [data-summary-fact] { gap: 3px; }
    ${MatchRow} { grid-template-columns: 1rem minmax(0, 1fr) auto auto; grid-template-areas: "number teams teams teams" "number meta meta kickoff" "number pick odds probability"; gap: 3px 6px; }
    ${MatchRow} [data-leg-number] { grid-area: number; display: block; align-self: stretch; padding-block-start: 1px; color: ${({ theme }) => theme.color.mutedText}; border-inline-end: 1px dashed ${({ theme }) => theme.color.border}; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 3px; }
  }

  /* 05: three equal metric cells make values line up across different slips. */
  &[data-compact-slip="compact-grid"] {
    summary { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: "identity identity identity" "odds average count"; gap: 7px 0; padding-inline-end: 9px; }
    [data-summary-fact] { flex-direction: column-reverse; align-items: center; justify-self: stretch; gap: 2px; text-align: center; }
    [data-summary-average], [data-summary-count] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-summary-count] { justify-self: stretch; align-self: stretch; display: grid; place-content: center; text-align: center; padding-inline: 4px; }
    [data-toggle-chevron] { inset-block-start: 12px; }
    details[open] [data-toggle-chevron] { inset-block-start: 15px; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) minmax(3.25rem, auto) minmax(4.5rem, auto); grid-template-areas: "teams teams teams" "meta meta kickoff" "pick odds probability"; gap: 5px 6px; }
    ${MatchRow} [data-pick], ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { border-block-start: 1px solid ${({ theme }) => theme.color.border}; padding-block-start: 4px; align-self: stretch; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { align-items: center; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
  }

  /* 06: selected outcomes lead; this differs from fixture-first ledgers. */
  &[data-compact-slip="pick-first"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity average" "count odds"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    [data-summary-average] { flex-direction: column-reverse; align-items: flex-end; gap: 1px; }
    ${MatchRow} { grid-template-columns: minmax(3.75rem, 0.8fr) minmax(0, 2fr) auto; grid-template-areas: "pick teams teams" "pick meta meta" "pick kickoff kickoff" "pick odds probability"; gap: 2px 7px; }
    ${MatchRow} [data-pick] { flex-direction: column-reverse; align-items: flex-start; justify-content: center; align-self: stretch; padding-inline-end: 7px; border-inline-end: 2px solid ${({ theme }) => theme.color.border}; }
    ${MatchRow} [data-pick-label] { font-size: 1rem; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 3px; }
    ${MatchRow} [data-leg-odds] { justify-self: start; }
  }

  /* 07: stacked participants leave stable columns for all numerical values. */
  &[data-compact-slip="fixture-ledger"] {
    summary { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "identity odds average" "count odds average"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-identity] { flex-direction: column; align-items: flex-start; gap: 2px; }
    [data-summary-fact] { flex-direction: column; align-items: flex-end; gap: 2px; }
    [data-summary-average] [data-fact-label] { max-inline-size: 5rem; text-align: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "teams odds probability" "pick odds probability" "meta meta meta" "kickoff kickoff kickoff"; gap: 2px 8px; }
    ${MatchRow} [data-teams] { flex-direction: column; gap: 1px; }
    ${MatchRow} [data-versus] { display: none; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { align-self: stretch; justify-content: center; padding-inline-start: 7px; border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
  }

  /* 08: average and individual probabilities receive the primary vertical rail. */
  &[data-compact-slip="probability-rail"] {
    summary { grid-template-columns: minmax(4.75rem, auto) minmax(0, 1fr) auto; grid-template-areas: "average identity identity" "average count odds"; gap: 4px 10px; }
    [data-summary-average] { align-self: stretch; justify-self: stretch; flex-direction: column-reverse; align-items: flex-start; justify-content: center; gap: 2px; padding-inline-end: 9px; border-inline-end: 2px solid ${({ theme }) => theme.color.brand}; }
    [data-summary-average] [data-fact-label] { max-inline-size: 5rem; }
    [data-summary-average] strong { font-size: 1.1875rem; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams probability" "meta probability" "kickoff probability" "pick odds"; gap: 2px 8px; }
    ${MatchRow} [data-leg-probability] { align-self: stretch; justify-content: center; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; padding-inline-start: 9px; }
    ${MatchRow} [data-leg-probability] strong { font-size: 1rem; }
    ${MatchRow} [data-kickoff] { justify-content: flex-start; }
    ${MatchRow} [data-leg-odds] { flex-direction: row; align-items: baseline; gap: 4px; }
  }

  /* 09: a narrow kickoff gutter establishes an explicit time-based reading order. */
  &[data-compact-slip="timeline"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count average"; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; }
    ${MatchRow} { grid-template-columns: 4.5rem minmax(0, 1fr) auto; grid-template-areas: "kickoff teams teams" "kickoff meta meta" "kickoff pick pick" "kickoff odds probability"; gap: 2px 8px; }
    ${MatchRow} [data-kickoff] { flex-direction: column-reverse; justify-content: flex-end; align-self: stretch; gap: 2px; padding-inline-end: 7px; border-inline-end: 1px solid ${({ theme }) => theme.color.border}; }
    ${MatchRow} [data-clock] { color: ${({ theme }) => theme.color.text}; font-weight: ${({ theme }) => theme.typography.weight.bold}; white-space: normal; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 4px; }
    ${MatchRow} [data-leg-odds] { justify-self: start; }
  }

  /* 10: corresponding fixture/price and metadata/probability pairs share each line. */
  &[data-compact-slip="paired-lines"] {
    summary { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "identity odds" "count average"; gap: 7px 10px; }
    [data-summary-count] { justify-self: start; }
    [data-summary-odds] { justify-self: end; flex-direction: row-reverse; }
    [data-summary-average] { flex-direction: row-reverse; }
    ${MatchRow} { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "teams odds" "pick probability" "meta kickoff"; gap: 5px 10px; }
    ${MatchRow} [data-leg-odds], ${MatchRow} [data-leg-probability] { flex-direction: row; align-items: baseline; gap: 4px; }
    ${MatchRow} [data-leg-odds] { flex-direction: row-reverse; }
    ${MatchRow} [data-kickoff] { max-inline-size: 7rem; }
  }

  /* Very narrow or enlarged text layouts retain every value and never force a fixed-width rail. */
  @media (max-width: 20rem) {
    summary { column-gap: 7px; padding-inline-start: 7px; }
    [data-summary-fact] strong { font-size: 0.8125rem; }
    ${MatchRow} { padding-inline: 7px; column-gap: 6px; }
  }
  @container (max-width: 20rem) {
    summary { column-gap: 7px; padding-inline-start: 7px; }
    [data-summary-fact] strong { font-size: 0.8125rem; }
    ${MatchRow} { padding-inline: 7px; column-gap: 6px; }
  }
`;
