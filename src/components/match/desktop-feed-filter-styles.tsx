"use client";

import styled, { css } from "styled-components";
import { Button } from "@/components/ui/controls";
import { media } from "@/styles/theme";
import { controlFeedback, focusRing } from "./filter-parts";

const fieldControl = css`
  box-sizing: border-box;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 40px;
  padding: 8px 11px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.3;
  &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  ${controlFeedback}
  ${focusRing}
`;

/** Desktop-only exports keep the existing phone filter components independent. */
export const Panel = styled.form`
  display: grid;
  gap: 8px;
  inline-size: 100%;
  min-inline-size: 0;
  padding: 14px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-block-start: 2px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
`;

export const HeadingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-inline-size: 0;
`;

export const Heading = styled.h1`
  flex: 1;
  min-inline-size: 0;
  margin: 0;
  font-size: 1.375rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.3;
  letter-spacing: -0.02em;
`;

export const PeriodField = styled.label`
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
  inline-size: 214px;
  min-inline-size: 0;
  > span { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  > select { ${fieldControl} cursor: pointer; }
`;

export const SearchField = styled.label`
  display: flex;
  align-items: center;
  gap: 9px;
  min-inline-size: 0;
  min-block-size: 40px;
  padding-inline: 12px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 17px; }
  > input {
    flex: 1;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 8px 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  }
  ${controlFeedback}
  &:focus-within { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;

export const OptionsRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) repeat(4, minmax(0, 1fr));
  gap: 8px;
  min-inline-size: 0;
`;

export const SectionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  min-inline-size: 0;
  min-block-size: 42px;
  padding: 9px 12px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  font: inherit;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  line-height: 1.3;
  text-align: start;
  cursor: pointer;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 17px; }
  > svg:last-child { font-size: 13px; }
  > [data-section-label] { flex: 1; min-inline-size: 0; white-space: nowrap; }
  @media (max-width: 74.99rem) { gap: 7px; padding-inline: 8px; }
  &[data-active="true"], &[aria-expanded="true"] { color: ${({ theme }) => theme.color.link}; border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.brandSoft}; }
  ${media.hover} { &:hover:enabled { border-color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.rowHover}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  ${focusRing}
`;

export const Count = styled.span`
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-inline-size: 20px;
  block-size: 20px;
  padding: 2px 5px;
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.brandSoft};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1;
  font-variant-numeric: tabular-nums;
`;

export const ActionRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  > [data-picks] {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 7px;
    min-inline-size: 0;
    min-block-size: 40px;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.8125rem;
    white-space: nowrap;
    cursor: pointer;
    > label { display: flex; flex-wrap: nowrap; align-items: center; gap: 7px; min-block-size: 40px; font-size: 0.8125rem; }
    input { flex: none; inline-size: 16px; block-size: 16px; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  }
`;

export const SortField = styled.label`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 7px;
  min-inline-size: 0;
  min-block-size: 40px;
  padding-inline: 11px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surface};
  font-size: 0.8125rem;
  > span { flex: none; }
  > select {
    min-inline-size: 0;
    min-block-size: 38px;
    padding: 6px 0;
    border: 0;
    border-radius: 0;
    color: ${({ theme }) => theme.color.text};
    background: transparent;
    font: inherit;
    cursor: pointer;
    ${focusRing}
  }
  ${controlFeedback}
`;

export const ActionButton = styled(Button)`
  && {
    flex: none;
    gap: 7px;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 8px 12px;
    border-radius: ${({ theme }) => theme.border.radius};
    font-size: 0.8125rem;
    line-height: 1.25;
    white-space: nowrap;
    > svg { flex: none; font-size: 17px; }
  }
`;

export const DialogContent = styled.div`
  min-inline-size: 0;
  fieldset { min-inline-size: 0; margin: 0; padding: 0; border: 0; }
  fieldset + fieldset { margin-block-start: 15px; padding-block-start: 13px; border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  legend { margin-block-end: 7px; padding: 0; font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-fields] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  label[data-input] { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  label[data-input][data-full] { grid-column: 1 / -1; }
  label[data-input] > input, label[data-input] > select, input[data-option-search] { ${fieldControl} }
  input[data-option-search] { margin-block-end: 6px; }
  label[data-choice] { display: flex; align-items: center; gap: 8px; min-block-size: 36px; font-size: 0.8125rem; cursor: pointer; }
  input[type="checkbox"] { flex: none; inline-size: 16px; block-size: 16px; margin: 0; accent-color: ${({ theme }) => theme.color.brand}; ${focusRing} }
  [data-options] { max-block-size: 180px; overflow-y: auto; overscroll-behavior: contain; }
  [data-help] { margin-block-start: 7px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; line-height: 1.4; }
`;

export const Error = styled.p.attrs({ role: "alert" })`
  margin: 0;
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: 0.8125rem;
  line-height: 1.4;
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.4;
`;
