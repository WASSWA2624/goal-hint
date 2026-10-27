"use client";

import type { ComponentPropsWithRef } from "react";
import styled from "styled-components";
import { SearchIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { controlFeedback, filterControlColors } from "./filter-parts";

type FeedSearchInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "aria-label" | "children"> & {
  label: string;
  submitLabel: string;
  submitDisabled?: boolean;
};

const Field = styled.div`
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
export function FeedSearchInput({ label, submitLabel, submitDisabled, ...props }: FeedSearchInputProps) {
  return <Field data-feed-search>
    <Input {...props} type="search" aria-label={label} />
    <Submit type="submit" disabled={props.disabled || submitDisabled}>
      <SearchIcon aria-hidden="true" />{submitLabel}
    </Submit>
  </Field>;
}
