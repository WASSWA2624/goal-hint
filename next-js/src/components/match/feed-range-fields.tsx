"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";

/** Date and time ranges share clear phone fields and compact desktop controls. */
export const RangeFieldset = styled.fieldset`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  font-size: var(--gh-font-secondary);
`;

export const RangeLegend = styled.legend`
  margin-block-end: var(--gh-spacing-1);
  padding: 0;
  font-size: var(--gh-font-body);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: var(--gh-leading-caption);
  ${media.desktop} { display: none; }
`;

export const RangeFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-1_5);
  input::-webkit-date-and-time-value { min-inline-size: 0; text-align: start; }
  input::-webkit-calendar-picker-indicator { inline-size: var(--gh-size-4); padding: 0; margin: 0; }
  ${media.belowDesktop} { @container feed-filter-fields (max-width: ${({ theme }) => theme.viewport[16]}) { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) { &[data-range="dates"] { grid-template-columns: minmax(0, 1fr); } }
`;

export const RangeHelp = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-caption);
  overflow-wrap: anywhere;
  &[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  ${media.belowDesktop} { font-size: var(--gh-font-secondary); line-height: var(--gh-leading-caption); }
`;

export const RangeHint = styled(RangeHelp)`
  ${media.belowDesktop} { font-size: var(--gh-font-caption); }
  ${media.desktop} { display: none; }
`;

