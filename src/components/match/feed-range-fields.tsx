"use client";

import styled from "styled-components";
import { controlFeedback } from "./filter-parts";

/** Date and time ranges share the same compact, always-visible controls. */
export const RangeFieldset = styled.fieldset`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  border: 0;
  border-radius: 0;
  font-size: 0.75rem;
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
    border: 1px solid ${({ theme }) => theme.color.controlBorder};
    border-radius: 0;
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
    border-radius: 0;
    font: inherit;
    outline: none;
  }
  input::-webkit-date-and-time-value { min-inline-size: 0; text-align: start; }
  input::-webkit-calendar-picker-indicator { inline-size: 0.875rem; padding: 0; margin: 0; }
  @media (min-width: 480px) { > label > span { max-inline-size: none; white-space: nowrap; } }
`;

export const RangeHelp = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  overflow-wrap: anywhere;
  &[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;

