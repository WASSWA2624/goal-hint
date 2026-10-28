"use client";

import type { ComponentPropsWithRef } from "react";
import styled, { css } from "styled-components";
import { SearchIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { controlFeedback, filterControlColors } from "./filter-parts";

type FeedSearchInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "aria-label" | "children"> & {
  label: string;
  submitLabel: string;
  submitDisabled?: boolean;
  compact?: boolean;
  mobile?: boolean;
};

const Field = styled.div<{ $compact?: boolean; $mobile?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-inline-size: 0;
  min-block-size: 2.75rem;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: ${({ theme }) => theme.border.radius};
  color: ${({ theme }) => theme.color.text};
  ${filterControlColors}
  ${controlFeedback}
  &:focus-within {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: 2px;
  }
  ${({ $compact }) => $compact && css`
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 6px;
    min-block-size: 2rem;
    padding-inline-start: 8px;
    border-radius: 0;
    background: ${({ theme }) => theme.color.surface};
    > svg { flex: none; font-size: 0.875rem; color: ${({ theme }) => theme.color.mutedText}; }
    > input, > button { min-block-size: calc(2rem - 2px); font-size: 0.75rem; }
    > input { padding: 4px 0; }
    > button {
      align-self: stretch;
      padding-inline: 9px;
      color: ${({ theme }) => theme.color.text};
      background: ${({ theme }) => theme.color.surfaceMuted};
      font-weight: ${({ theme }) => theme.typography.weight.medium};
    }
    @media (pointer: coarse) {
      min-block-size: 44px;
      > input, > button { min-block-size: 44px; }
      > input { font-size: 1rem; }
    }
  `}
  ${({ $mobile }) => $mobile && css`
    ${media.belowDesktop} {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      border-radius: 0;
      background: ${({ theme }) => theme.color.surface};
      > input, > button { min-block-size: 44px; }
      > input { padding: 6px 8px 6px 0; }
      > input::placeholder { font-size: 0.75rem; }
      > button {
        min-inline-size: 44px;
        padding: 0;
        border: 0;
        color: ${({ theme }) => theme.color.mutedText};
      }
      > button > svg { font-size: 0.9375rem; }
    }
  `}
`;

const Input = styled.input`
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 2.625rem;
  padding: 8px 12px;
  border: 0;
  border-radius: 0;
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 1rem;
  line-height: 1.3;
  &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  ${media.desktop} { font-size: 0.875rem; }
`;

const Submit = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 2.625rem;
  padding-inline: 14px;
  border: 0;
  border-inline-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  color: ${({ theme }) => theme.color.link};
  background: transparent;
  font: inherit;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: -4px;
  }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
`;

/** A single search field with an inset action; its parent form owns submission. */
export function FeedSearchInput({ label, submitLabel, submitDisabled, compact = false, mobile = false, ...props }: FeedSearchInputProps) {
  const input = <Input {...props} type="search" aria-label={label} enterKeyHint={mobile ? "search" : props.enterKeyHint} />;
  const submit = <Submit type="submit" disabled={props.disabled || submitDisabled}
    aria-label={mobile ? submitLabel : undefined} title={mobile ? submitLabel : undefined}>
    {(mobile || !compact) && <SearchIcon aria-hidden="true" />}{!mobile && submitLabel}
  </Submit>;
  return <Field data-feed-search $compact={compact} $mobile={mobile}>
    {mobile ? submit : compact && <SearchIcon aria-hidden="true" />}
    {input}
    {!mobile && submit}
  </Field>;
}
