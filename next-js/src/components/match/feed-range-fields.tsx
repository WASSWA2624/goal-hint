"use client";

import styled from "styled-components";
import { controlFeedback } from "./filter-parts";
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  > label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
    min-block-size: 1.875rem;
    padding-inline: 4px;
    background: ${({ theme }) => theme.color.surface};
    /* Editable field boundaries stay distinct from quiet section frames. */
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
    border-radius: ${({ theme }) => theme.radius.control};
    ${controlFeedback}
    &:has(input:focus-visible) { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
    &:has(input[aria-invalid="true"]) { border-color: ${({ theme }) => theme.color.outcome.incorrect.border}; }
  }
  > label > span {
    flex: none;
    max-inline-size: 2.25rem;
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    line-height: 1.1;
  }
  input {
    flex: 1;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 1.75rem;
    padding: 0;
    color: ${({ theme }) => theme.color.text};
    background: transparent;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.none};
    font: inherit;
    outline: none;
  }
  input::-webkit-date-and-time-value { min-inline-size: 0; text-align: start; }
  input::-webkit-calendar-picker-indicator { inline-size: 0.875rem; padding: 0; margin: 0; }
  ${media.belowDesktop} {
    gap: 6px;
    @container feed-filter-fields (max-width: 16rem) { grid-template-columns: minmax(0, 1fr); }
    > label {
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 0;
      background: transparent;
      border: 0;
      &:has(input:focus-visible) { outline: none; }
    }
    > label > span {
      max-inline-size: none;
      color: ${({ theme }) => theme.color.mutedText};
      font-size: 0.75rem;
      font-weight: ${({ theme }) => theme.typography.weight.body};
      line-height: 1.35;
    }
    input {
      flex: none;
      max-inline-size: 100%;
      min-block-size: 2.5rem;
      padding: 4px 8px;
      background: ${({ theme }) => theme.color.surface};
      border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
      border-radius: ${({ theme }) => theme.radius.control};
      font-size: 16px;
      line-height: 1.2;
      ${controlFeedback}
      &:focus-visible {
        outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
        outline-offset: 2px;
      }
      &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.border}; }
    }
    input::-webkit-calendar-picker-indicator { inline-size: 16px; block-size: 16px; }
  }
  @media (max-width: 360px) { &[data-range="dates"] { grid-template-columns: minmax(0, 1fr); } }
  @media (min-width: 480px) { > label > span { max-inline-size: none; white-space: nowrap; } }
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

