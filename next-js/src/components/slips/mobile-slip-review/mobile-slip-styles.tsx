"use client";

import styled from "styled-components";

/** Candidates vary only presentation around the shared production Clean ledger row. */
export const MobileSlipLayout = styled.div`
  min-inline-size: 0;
  &[data-mobile-design="fixture-rule"] {
    [data-mobile-teams] { border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding-block-end: var(--gh-spacing-1); }
    [data-mobile-facts] { padding-block-start: var(--gh-spacing-0_25); }
  }
  &[data-mobile-design="accent-edge"] {
    [data-mobile-row] { border-inline-start: var(--gh-stroke-focus) solid ${({ theme }) => theme.color.brand}; padding-inline-start: var(--gh-spacing-1_5); }
    [data-mobile-date] { color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-bold); }
  }
  &[data-mobile-design="market-band"] {
    [data-mobile-row] { padding-block-end: 0; }
    [data-mobile-facts] {
      margin-inline: calc(-1 * var(--gh-spacing-2)); padding: var(--gh-spacing-1) var(--gh-spacing-2); background: ${({ theme }) => theme.color.brandSoft};
      border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
    }
  }
  &[data-mobile-design="four-cells"] {
    [data-mobile-row] { padding-block-end: 0; }
    [data-mobile-facts] { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-inline: calc(-1 * var(--gh-spacing-2)); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
    [data-mobile-field] { flex-direction: column; align-items: center; gap: var(--gh-spacing-0_25); padding: var(--gh-spacing-0_75) var(--gh-spacing-0_5); }
    [data-mobile-field] + [data-mobile-field] { border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  }
  &[data-mobile-design="odds-focus"] {
    [data-mobile-facts] { align-items: center; }
    [data-mobile-field="odds"] { padding: var(--gh-spacing-0_75) var(--gh-spacing-1_25); outline: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; outline-offset: calc(-1 * var(--gh-size-0_25)); }
    [data-mobile-field="odds"] strong { font-weight: var(--gh-weight-heavy); }
  }
  &[data-mobile-design="probability-focus"] {
    [data-mobile-facts] { align-items: center; gap: var(--gh-spacing-1_5); }
    [data-mobile-field="probability"] { padding: var(--gh-spacing-0_75) var(--gh-spacing-1_25); background: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; }
    [data-mobile-field="probability"] [data-field-label] { color: inherit; }
  }
  &[data-mobile-design="ticket-lines"] {
    [data-mobile-row] { gap: var(--gh-spacing-0_75); }
    [data-mobile-kickoff], [data-mobile-facts] { font-family: ${({ theme }) => theme.typography.monoFamily}; }
    [data-mobile-facts] { border-block-start: var(--gh-stroke-thin) dashed ${({ theme }) => theme.color.border}; padding-block-start: var(--gh-spacing-1); gap: var(--gh-spacing-1_5); }
    li + li { border-block-start-style: dashed; }
  }
  &[data-mobile-design="alternating-rows"] {
    li:nth-child(even) [data-mobile-row] { background: ${({ theme }) => theme.color.surfaceMuted}; }
    [data-mobile-row] { row-gap: var(--gh-spacing-1_25); }
    [data-mobile-field="odds"], [data-mobile-field="probability"] { border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding-inline-start: var(--gh-spacing-1_5); }
  }
  &[data-mobile-design="minimal-type"] {
    [data-mobile-row] { row-gap: var(--gh-spacing-0_75); padding-block: var(--gh-spacing-1_25); }
    [data-mobile-teams] { grid-template-columns: minmax(0, max-content) auto minmax(0, max-content); justify-content: start; font-weight: var(--gh-weight-semibold); }
    [data-home] { justify-content: flex-start; }
    [data-mobile-field="prediction"] strong { color: inherit; }
    [data-mobile-field="odds"] strong, [data-mobile-field="probability"] strong { font-weight: var(--gh-weight-semibold); }
  }

  @container (max-width: ${({ theme }) => theme.viewport[19]}) {
    [data-mobile-row] { padding-inline: var(--gh-spacing-1_5); }
    [data-mobile-meta] { gap: var(--gh-spacing-1_25); }
    [data-mobile-competition] { gap: var(--gh-spacing-1_25); }
    [data-mobile-facts] { column-gap: var(--gh-spacing-1_25); }
    [data-mobile-field] { column-gap: var(--gh-spacing-0_75); }
    &[data-mobile-design="market-band"] [data-mobile-facts] { margin-inline: calc(-1 * var(--gh-spacing-1_5)); padding-inline: var(--gh-spacing-1_5); }
    &[data-mobile-design="four-cells"] [data-mobile-facts] { margin-inline: calc(-1 * var(--gh-spacing-1_5)); }
  }
`;
