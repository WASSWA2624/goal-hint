"use client";

import styled from "styled-components";

/** Scoped candidates only: production and mobile slip styling never receive these overrides. */
export const DesktopSlipLayout = styled.div`
  min-inline-size: 0;

  &&& [data-slip-summary] {
    grid-template-columns: minmax(13rem, 1fr) minmax(8.25rem, auto) minmax(7.5rem, auto) minmax(12rem, auto);
    grid-template-areas: "identity odds count average";
    grid-template-rows: 1fr;
    min-block-size: 44px; block-size: 44px;
    column-gap: 24px; row-gap: 0; padding: 0 36px 0 12px;
    white-space: nowrap; font-size: 0.75rem; line-height: 1.25;
  }
  &&& [data-summary-identity] { flex-wrap: nowrap; align-items: center; gap: 9px; white-space: nowrap; font-size: 0.875rem; }
  &&& [data-rank] { font-size: 0.75rem; }
  &&& [data-summary-fact] { flex-wrap: nowrap; flex-direction: row; align-items: baseline; gap: 6px; }
  &&& [data-summary-fact] strong { font-size: 0.875rem; }
  &&& [data-summary-odds], &&& [data-summary-count], &&& [data-summary-average] { justify-self: end; }
  &&& [data-summary-average] [data-fact-label] { max-inline-size: none; }

  &&& [data-fixture-id] {
    position: relative; display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.46fr) 6.25rem 9.75rem;
    grid-template-areas: "meta meta kickoff kickoff" "teams pick odds probability";
    grid-template-rows: 1rem 1.25rem;
    align-items: center; column-gap: 12px; row-gap: 3px;
    padding: 6px 12px; min-block-size: 51px;
    font-size: 0.75rem; line-height: 1.25; overflow-wrap: normal;
    --desktop-result-room: 0px;
  }
  &&& [data-fixture-id]:has([data-result]) { --desktop-result-room: 6rem; }
  &&& [data-meta] { flex-wrap: nowrap; align-items: center; gap: 6px; white-space: nowrap; font-size: 0.75rem; line-height: 1rem; }
  &&& [data-competition] { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  &&& [data-competition] img, &&& [data-competition] svg { flex: none; inline-size: 0.75rem; block-size: 0.75rem; object-fit: contain; }
  &&& [data-kickoff] { flex-wrap: nowrap; gap: 8px; justify-content: flex-end; align-items: center; padding-inline-end: var(--desktop-result-room); white-space: nowrap; font-size: 0.75rem; line-height: 1rem; }
  &&& [data-teams] { flex-wrap: nowrap; align-items: center; gap: 7px; white-space: nowrap; font-size: 0.84375rem; line-height: 1.25rem; }
  &&& [data-home], &&& [data-away] { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  &&& [data-versus] { font-size: 0.75rem; }
  &&& [data-team-logo] { --gh-logo-size: 0.8125rem; --gh-logo-font: 0.4375rem; --gh-logo-radius: 0; }
  &&& [data-competition] [data-team-logo] { --gh-logo-size: 0.75rem; }
  &&& [data-pick] { flex-wrap: nowrap; align-items: center; gap: 7px; white-space: nowrap; }
  &&& [data-market-label], &&& [data-number-label] { font-size: 0.75rem; line-height: 1.25rem; }
  &&& [data-pick-label] { font-size: 0.84375rem; line-height: 1.25rem; }
  &&& [data-leg-odds], &&& [data-leg-probability] { flex-direction: row; align-items: center; justify-content: flex-end; gap: 6px; white-space: nowrap; }
  &&& [data-leg-odds] strong, &&& [data-leg-probability] strong { font-size: 0.84375rem; line-height: 1.25rem; }
  &&& [data-result] { position: absolute; inset-block-start: 6px; inset-inline-end: 12px; align-items: center; gap: 5px; font-size: 0.75rem; line-height: 1rem; white-space: nowrap; }
  &&& [data-saved-score] { font-variant-numeric: tabular-nums; }

  &[data-desktop-design="balanced-ledger"] {
    &&& [data-slip-summary] { background: ${({ theme }) => theme.color.surface}; }
    &&& [data-summary-identity] { padding-inline-start: 2px; }
    &&& [data-fixture-id] { column-gap: 16px; }
    &&& [data-summary-odds] { justify-self: start; }
  }

  &[data-desktop-design="metric-columns"] {
    &&& [data-slip-summary] { grid-template-columns: minmax(13rem, 1fr) 10rem 9rem 14rem; column-gap: 0; padding-inline-end: 36px; }
    &&& [data-summary-odds], &&& [data-summary-count], &&& [data-summary-average] {
      align-self: stretch; justify-self: stretch; display: flex; justify-content: center; align-items: center;
      border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline: 12px;
    }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 13.5rem 7rem 10rem; column-gap: 0; }
    &&& [data-pick], &&& [data-leg-odds], &&& [data-leg-probability] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 12px; }
    &&& [data-pick] { justify-content: center; }
    &&& [data-leg-odds], &&& [data-leg-probability] { justify-content: center; }
  }

  &[data-desktop-design="odds-dock"] {
    &&& [data-slip-summary] { grid-template-columns: minmax(13rem, 1fr) 9rem 8rem 12rem; column-gap: 20px; }
    &&& [data-summary-odds] { justify-self: stretch; align-self: stretch; justify-content: center; background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.link}; }
    &&& [data-summary-odds] strong { font-size: 1rem; }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 12.5rem 6.25rem 9rem; }
    &&& [data-leg-odds] { align-self: stretch; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; padding-inline-start: 10px; }
    &&& [data-leg-odds] strong { font-size: 0.9375rem; }
    &&& [data-kickoff] { justify-content: flex-start; }
  }

  &[data-desktop-design="prediction-focus"] {
    &&& [data-slip-summary] { grid-template-columns: minmax(13rem, 1fr) 8rem 8rem 13rem; }
    &&& [data-summary-identity] { color: ${({ theme }) => theme.color.link}; }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 13.5rem 6rem 9rem; column-gap: 15px; }
    &&& [data-pick] { justify-content: space-between; padding-inline: 8px; background: ${({ theme }) => theme.color.brandSoft}; }
    &&& [data-pick-label] { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
    &&& [data-meta] { color: ${({ theme }) => theme.color.text}; }
  }

  &[data-desktop-design="probability-focus"] {
    &&& [data-slip-summary] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; grid-template-columns: minmax(13rem, 1fr) 8rem 8rem 13rem; }
    &&& [data-summary-average] strong { color: ${({ theme }) => theme.color.link}; font-size: 1rem; }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 12rem 6rem 10rem; }
    &&& [data-leg-probability] { align-self: stretch; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; padding-inline-start: 9px; }
    &&& [data-leg-probability] strong { color: ${({ theme }) => theme.color.link}; font-size: 0.9375rem; }
    &&& [data-kickoff] { justify-content: flex-start; }
  }

  &[data-desktop-design="ticket-gutter"] {
    &&& [data-slip-summary] { border-inline-start: 4px solid ${({ theme }) => theme.color.brand}; padding-inline-start: 13px; }
    &&& [data-fixture-id] { padding-inline-start: 38px; grid-template-columns: minmax(0, 1fr) 12rem 6rem 9rem; }
    &&& [data-leg-number] { display: grid; place-items: center; position: absolute; inset-inline-start: 0; inset-block: 0; inline-size: 27px; color: ${({ theme }) => theme.color.mutedText}; border-inline-end: 1px dashed ${({ theme }) => theme.color.border}; font-variant-numeric: tabular-nums; }
    &&& [data-summary-identity] { padding-inline-start: 17px; }
    &&& [data-kickoff] { justify-content: flex-start; }
  }

  &[data-desktop-design="banded-register"] {
    &&& [data-slip-summary] { background: ${({ theme }) => theme.color.surface}; border-block-end-color: ${({ theme }) => theme.color.controlBorder}; }
    &&& li:nth-child(even) [data-fixture-id] { background: ${({ theme }) => theme.color.cardHeader}; }
    &&& li + li { border-block-start-color: transparent; }
    &&& [data-fixture-id] { padding-block: 5px; row-gap: 2px; min-block-size: 48px; grid-template-columns: minmax(0, 1fr) 12rem 6rem 9rem; }
    &&& [data-result] { inset-block-start: 5px; }
    &&& [data-meta] { font-weight: ${({ theme }) => theme.typography.weight.body}; }
  }

  &[data-desktop-design="club-centre"] {
    &&& [data-slip-summary] { grid-template-columns: minmax(13rem, 1fr) 10rem 9rem 13rem; column-gap: 12px; }
    &&& [data-summary-odds], &&& [data-summary-count], &&& [data-summary-average] { justify-self: center; }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 12rem 6rem 9rem; }
    &&& [data-teams] { justify-content: center; }
    &&& [data-meta] { justify-content: center; }
    &&& [data-pick] { justify-content: center; }
    &&& [data-leg-odds], &&& [data-leg-probability] { justify-content: center; }
  }

  &[data-desktop-design="rail-divider"] {
    &&& [data-slip-summary] { column-gap: 16px; background: ${({ theme }) => theme.color.surface}; }
    &&& [data-summary-odds], &&& [data-summary-count], &&& [data-summary-average] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 16px; }
    &&& [data-fixture-id] { grid-template-columns: minmax(0, 1fr) 12.75rem 6.5rem 9.75rem; column-gap: 12px; }
    &&& [data-pick], &&& [data-leg-odds], &&& [data-leg-probability] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 12px; }
    &&& [data-meta] { padding-inline-start: 3px; }
  }

  &[data-desktop-design="minimal-line"] {
    &&& [data-compact-slip] { border-inline: 0; }
    &&& [data-slip-summary] { background: ${({ theme }) => theme.color.surface}; column-gap: 20px; padding-inline-start: 8px; }
    &&& [data-summary-fact] { flex-direction: row-reverse; gap: 5px; }
    &&& [data-fixture-id] { padding: 4px 8px; row-gap: 0; min-block-size: 44px; grid-template-columns: minmax(0, 1fr) 12rem 6rem 9rem; }
    &&& [data-leg-odds], &&& [data-leg-probability] { flex-direction: row-reverse; justify-content: flex-start; gap: 5px; }
    &&& [data-result] { inset-block-start: 4px; inset-inline-end: 8px; }
    &&& [data-meta] { font-size: 0.75rem; }
  }
`;
