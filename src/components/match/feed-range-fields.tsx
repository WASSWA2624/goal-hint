"use client";

import styled from "styled-components";
import { focusRing } from "./filter-parts";

/** Date and time ranges share the same compact, always-visible controls. */
export const RangeFieldset = styled.fieldset`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  color: ${({ theme }) => theme.color.text};
  border: 0;
  border-radius: 0;
  font-size: 0.75rem;
  > legend { padding: 0 0 4px; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > legend > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;

export const RangeFields = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  > label { display: grid; gap: 3px; min-inline-size: 0; }
  input {
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 2rem;
    padding: 3px 5px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: 1px solid ${({ theme }) => theme.color.controlBorder};
    border-radius: 0;
    font: inherit;
    ${focusRing}
  }
  input[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.border}; }
  input::-webkit-date-and-time-value { min-inline-size: 0; text-align: start; }
`;

export const RangeHelp = styled.p`
  grid-column: 1 / -1;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.6875rem;
  overflow-wrap: anywhere;
  &[role="alert"] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;

