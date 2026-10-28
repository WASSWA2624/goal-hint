"use client";

import styled from "styled-components";

/** Review-only rows; every candidate retains the approved Balanced ledger header. */
export const DesktopSlipLayout = styled.div`
  min-inline-size: 0;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(13rem, 1fr) minmax(8.25rem, auto) minmax(7.5rem, auto) minmax(12rem, auto);
    grid-template-areas: "identity odds count average"; grid-template-rows: 1fr;
    min-block-size: 2.25rem; block-size: 2.25rem;
    column-gap: 24px; row-gap: 0; padding: 0 36px 0 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
    background: ${({ theme }) => theme.color.surface};
  }
  &&& [data-summary-identity] { flex-wrap: nowrap; align-items: center; gap: 9px; padding-inline-start: 2px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds] { justify-self: start; }
  &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }

  [data-desktop-row] {
    --desktop-columns: 3.5rem 5.1rem minmax(5.5rem, 1fr) minmax(3.75rem, 0.65fr) minmax(8rem, 2fr) minmax(6.5rem, 0.95fr) 4.2rem 4.8rem;
    position: relative; display: grid; grid-template-columns: var(--desktop-columns);
    grid-template-rows: minmax(1.25rem, auto); align-items: center; column-gap: 8px;
    min-inline-size: 0; min-block-size: 2.25rem; padding: 4px 12px;
    color: ${({ theme }) => theme.color.text}; font-size: 0.75rem; line-height: 1.25rem;
    white-space: nowrap; overflow-wrap: normal; font-variant-numeric: tabular-nums;
  }
  [data-desktop-row]:has([data-row-result]) { grid-template-columns: var(--desktop-columns) max-content; }
  [data-desktop-row] > * { min-inline-size: 0; }
  [data-row-date], [data-row-time], [data-row-league], [data-row-country] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-league], [data-row-country], [data-row-market], [data-row-odds], [data-row-probability], [data-row-result] {
    display: flex; align-items: center; min-inline-size: 0; gap: 4px;
  }
  [data-row-teams] {
    display: flex; align-items: center; justify-content: flex-end;
    min-inline-size: 0; gap: 5px; margin: 0; font-size: 0.8125rem; line-height: 1.25rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  [data-home], [data-away] { display: flex; flex: 0 1 auto; align-items: center; min-inline-size: 0; max-inline-size: calc(50% - 0.75rem); gap: 4px; }
  [data-home] { justify-content: flex-end; }
  [data-home] [data-ellipsis-text] { text-align: end; }
  [data-versus] { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
  [data-truncation] { position: relative; display: inline-flex; flex: 1 1 auto; min-inline-size: 0; max-inline-size: 100%; }
  [data-ellipsis-text] { display: block; min-inline-size: 0; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  [data-truncation]:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  [data-team-logo] { --gh-logo-size: 0.8125rem; --gh-logo-font: 0.4375rem; --gh-logo-radius: 0; flex: none; }
  [data-row-league] [data-team-logo] { --gh-logo-size: 0.75rem; }
  [data-country-flag] { flex: none; inline-size: 1.125rem; block-size: 0.75rem; object-fit: contain; }
  [data-row-market] { gap: 5px; }
  [data-row-market] > strong { color: ${({ theme }) => theme.color.link}; font-size: 0.8125rem; }
  [data-desktop-row] [data-market-label], [data-desktop-row] [data-number-label] { color: ${({ theme }) => theme.color.mutedText}; }
  [data-row-odds], [data-row-probability] { justify-content: flex-end; }
  [data-row-odds] strong, [data-row-probability] strong { font-size: 0.8125rem; }
  [data-row-result] { gap: 4px; justify-content: flex-end; font-size: 0.75rem; }
  [data-desktop-row][data-outcome="correct"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.correct.text}; }
  [data-desktop-row][data-outcome="incorrect"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  [data-desktop-row][data-outcome="void"] [data-row-result] { color: ${({ theme }) => theme.color.outcome.void.text}; }

  &[data-desktop-design="inline-columns"] {
    [data-desktop-row] { column-gap: 0; --desktop-columns: 4rem 5.5rem minmax(5.5rem, 1fr) minmax(3.75rem, 0.7fr) minmax(8rem, 2fr) minmax(6.5rem, 1fr) 4.6rem 5rem; }
    [data-desktop-row] > :not(:first-child) { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline: 6px; }
    [data-row-odds], [data-row-probability] { justify-content: center; }
  }
  &[data-desktop-design="fixture-priority"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(4.75rem, 0.8fr) minmax(3.25rem, 0.5fr) minmax(9rem, 2.7fr) minmax(6rem, 0.9fr) 4.2rem 4.8rem; }
    [data-row-teams] { border-inline: 2px solid ${({ theme }) => theme.color.border}; padding-inline: 7px; }
  }
  &[data-desktop-design="market-panel"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 0.9fr) minmax(3.5rem, 0.6fr) minmax(8rem, 1.9fr) minmax(7rem, 1.1fr) 4.2rem 4.8rem; min-block-size: 2.375rem; }
    [data-row-market] { align-self: stretch; justify-content: center; padding-inline: 5px; background: ${({ theme }) => theme.color.brandSoft}; }
  }
  &[data-desktop-design="odds-anchor"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 1fr) minmax(3.5rem, 0.6fr) minmax(8rem, 2fr) minmax(6.5rem, 0.95fr) 4.5rem 4.8rem; }
    [data-row-odds] { align-self: stretch; padding-inline: 5px; background: ${({ theme }) => theme.color.surfaceMuted}; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; }
    [data-row-odds] strong { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  }
  &[data-desktop-design="probability-anchor"] {
    [data-row-probability] { align-self: stretch; border-inline-start: 2px solid ${({ theme }) => theme.color.brand}; padding-inline-start: 6px; }
    [data-row-probability] strong { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  }
  &[data-desktop-design="country-rail"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 1fr) minmax(4.5rem, 0.95fr) minmax(8rem, 1.9fr) minmax(6rem, 0.85fr) 4.2rem 4.8rem; }
    [data-row-country] { border-inline-end: 1px solid ${({ theme }) => theme.color.border}; padding-inline-end: 6px; }
    [data-row-league] { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
  &[data-desktop-design="alternating-lines"] {
    li:nth-child(even) [data-desktop-row] { background: ${({ theme }) => theme.color.cardHeader}; }
    li + li { border-block-start-color: transparent; }
    [data-desktop-row] { min-block-size: 2.125rem; padding-block: 3px; }
  }
  &[data-desktop-design="subtle-dividers"] {
    [data-row-country], [data-row-market], [data-row-odds] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 6px; }
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 1fr) minmax(4rem, 0.65fr) minmax(8rem, 2fr) minmax(6.5rem, 1fr) 4.5rem 4.8rem; }
  }
  &[data-desktop-design="minimal-line"] {
    [data-desktop-row] { min-block-size: 2rem; padding: 3px 10px; column-gap: 6px; }
    [data-row-odds] strong, [data-row-probability] strong { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  }

  @media (pointer: coarse) {
    &&& [data-slip-summary] { min-block-size: 44px; block-size: max(44px, 2.25rem); }
    [data-desktop-row] { min-block-size: 44px; }
  }
`;
