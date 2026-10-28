"use client";

import styled from "styled-components";

/** Candidates vary only presentation around the shared production Clean ledger row. */
export const MobileSlipLayout = styled.div`
  min-inline-size: 0;
  &[data-mobile-design="fixture-rule"] {
    [data-mobile-teams] { border-block-end: 1px solid ${({ theme }) => theme.color.border}; padding-block-end: 4px; }
    [data-mobile-facts] { padding-block-start: 1px; }
  }
  &[data-mobile-design="accent-edge"] {
    [data-mobile-row] { border-inline-start: 3px solid ${({ theme }) => theme.color.brand}; padding-inline-start: 6px; }
    [data-mobile-date] { color: ${({ theme }) => theme.color.text}; font-weight: 700; }
  }
  &[data-mobile-design="market-band"] {
    [data-mobile-row] { padding-block-end: 0; }
    [data-mobile-facts] {
      margin-inline: -8px; padding: 4px 8px; background: ${({ theme }) => theme.color.brandSoft};
      border-block-start: 1px solid ${({ theme }) => theme.color.border};
    }
  }
  &[data-mobile-design="four-cells"] {
    [data-mobile-row] { padding-block-end: 0; }
    [data-mobile-facts] { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-inline: -8px; border-block-start: 1px solid ${({ theme }) => theme.color.border}; }
    [data-mobile-field] { flex-direction: column; align-items: center; gap: 1px; padding: 3px 2px; }
    [data-mobile-field] + [data-mobile-field] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
  }
  &[data-mobile-design="odds-focus"] {
    [data-mobile-facts] { align-items: center; }
    [data-mobile-field="odds"] { padding: 3px 5px; outline: 1px solid ${({ theme }) => theme.color.controlBorder}; outline-offset: -1px; }
    [data-mobile-field="odds"] strong { font-weight: 800; }
  }
  &[data-mobile-design="probability-focus"] {
    [data-mobile-facts] { align-items: center; gap: 6px; }
    [data-mobile-field="probability"] { padding: 3px 5px; background: ${({ theme }) => theme.color.brand}; color: ${({ theme }) => theme.color.onBrand}; }
    [data-mobile-field="probability"] [data-field-label] { color: inherit; }
  }
  &[data-mobile-design="ticket-lines"] {
    [data-mobile-row] { gap: 3px; }
    [data-mobile-kickoff], [data-mobile-facts] { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    [data-mobile-facts] { border-block-start: 1px dashed ${({ theme }) => theme.color.border}; padding-block-start: 4px; gap: 6px; }
    li + li { border-block-start-style: dashed; }
  }
  &[data-mobile-design="alternating-rows"] {
    li:nth-child(even) [data-mobile-row] { background: ${({ theme }) => theme.color.surfaceMuted}; }
    [data-mobile-row] { row-gap: 5px; }
    [data-mobile-field="odds"], [data-mobile-field="probability"] { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline-start: 6px; }
  }
  &[data-mobile-design="minimal-type"] {
    [data-mobile-row] { row-gap: 3px; padding-block: 5px; }
    [data-mobile-teams] { grid-template-columns: minmax(0, max-content) auto minmax(0, max-content); justify-content: start; font-weight: 600; }
    [data-home] { justify-content: flex-start; }
    [data-mobile-field="prediction"] strong { color: inherit; }
    [data-mobile-field="odds"] strong, [data-mobile-field="probability"] strong { font-weight: 600; }
  }

  @container (max-width: 19rem) {
    [data-mobile-row] { padding-inline: 6px; }
    [data-mobile-meta] { gap: 5px; }
    [data-mobile-competition] { gap: 5px; }
    [data-mobile-facts] { column-gap: 5px; }
    [data-mobile-field] { column-gap: 3px; }
    &[data-mobile-design="market-band"] [data-mobile-facts] { margin-inline: -6px; padding-inline: 6px; }
    &[data-mobile-design="four-cells"] [data-mobile-facts] { margin-inline: -6px; }
  }
`;
