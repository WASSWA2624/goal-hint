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
  font-size: 0.75rem;
`;

export const RangeLegend = styled.legend`
  margin-block-end: 4px;
  padding: 0;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 1.35;
  ${media.desktop} { display: none; }
`;

export const RangeFields = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px;
  input::-webkit-date-and-time-value { min-inline-size: 0; text-align: start; }
  input::-webkit-calendar-picker-indicator { inline-size: 16px; padding: 0; margin: 0; }
  ${media.belowDesktop} { @container feed-filter-fields (max-width: 16rem) { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 360px) { &[data-range="dates"] { grid-template-columns: minmax(0, 1fr); } }
`;

export const RangeHelp = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  overflow-wrap: anywhere;
  &[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  ${media.belowDesktop} { font-size: 0.75rem; line-height: 1.35; }
`;

export const RangeHint = styled(RangeHelp)`
  ${media.belowDesktop} { font-size: 0.6875rem; }
  ${media.desktop} { display: none; }
`;

