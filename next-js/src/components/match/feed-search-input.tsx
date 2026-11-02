"use client";

import { useId, type ComponentPropsWithRef } from "react";
import styled, { css } from "styled-components";
import { floatingControl, floatingLabel, floatingFieldState, floatingOutline } from "@/components/ui/floating-field-styles";
import { controlHeight } from "@/components/ui/control-layout";
import { FloatingOutline } from "@/components/ui/floating-outline";
import { SearchIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { filterControlColors } from "./filter-parts";
import { textFieldSurface } from "@/components/ui/filled-surfaces";

type FeedSearchInputProps = Omit<ComponentPropsWithRef<"input">, "type" | "aria-label" | "children"> & {
  label: string;
  submitLabel: string;
  submitDisabled?: boolean;
  compact?: boolean;
  mobile?: boolean;
};

const Field = styled.div.attrs<{ "data-text-field-frame"?: string }>({ "data-text-field-frame": "" })<{ $compact?: boolean; $mobile?: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-inline-size: 0;
  min-block-size: var(--gh-size-10);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.text};
  ${filterControlColors}
  ${({ $compact }) => $compact && css`
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 0;
    min-block-size: var(--gh-size-8);
    padding-inline-start: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    background: ${({ theme }) => theme.color.field};
    > svg { flex: none; margin-inline-end: var(--gh-spacing-1_5); font-size: var(--gh-font-emphasis); color: ${({ theme }) => theme.color.mutedText}; }
    > input, > button { min-block-size: calc(var(--gh-size-8) - var(--gh-size-0_5)); font-size: var(--gh-font-secondary); }
    > input { padding: var(--gh-spacing-1) var(--gh-spacing-2) var(--gh-spacing-1) 0; }
    > button {
      align-self: stretch;
      padding-inline: var(--gh-spacing-2_25);
      color: ${({ theme }) => theme.color.text};
      background: ${({ theme }) => theme.color.surfaceMuted};
      font-weight: ${({ theme }) => theme.typography.weight.medium};
    }
    @media (pointer: coarse) {
      min-block-size: var(--gh-size-11);
      > input, > button { min-block-size: var(--gh-size-11); }
      > input { font-size: var(--gh-font-section); }
    }
  `}
  ${({ $mobile }) => $mobile && css`
    ${media.belowDesktop} {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-inline-start: 0;
      align-items: center;
      min-block-size: var(--gh-size-9);
      border-radius: ${({ theme }) => theme.radius.control};
      background: ${({ theme }) => theme.color.field};
      > input, > button { min-block-size: var(--gh-size-8_5); }
      > input { padding: var(--gh-spacing-0_5) var(--gh-spacing-2); }
      > input::placeholder { font-size: var(--gh-font-secondary); }
      > button {
        min-inline-size: var(--gh-size-9);
        padding: 0;
        border: 0;
        color: ${({ theme }) => theme.color.mutedText};
      }
      > button > svg { font-size: var(--gh-font-reading); }
    }
  `}
  position: relative; margin-block-start: var(--floating-label-space);
  ${controlHeight} box-sizing: border-box;
  && > input, && > button { min-block-size: calc(var(--form-control-height) - var(--gh-size-0_5)); block-size: calc(var(--form-control-height) - var(--gh-size-0_5)); }
  && > label { ${floatingLabel} max-inline-size: calc(100% - var(--gh-size-25)); }
  && > input { ${floatingControl} min-block-size: calc(var(--form-control-height) - var(--gh-size-0_5)); block-size: calc(var(--form-control-height) - var(--gh-size-0_5)); padding-inline: var(--gh-spacing-2_5); }
  &&& > input { border: 0; background: transparent; }
  &&& > input:focus-visible { outline: none; }
  > [data-floating-outline] { ${floatingOutline} }
  ${floatingFieldState}
  && { ${textFieldSurface} border: var(--gh-stroke-thin) solid transparent; }
`;

const Input = styled.input`
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: var(--gh-size-9_5);
  padding: var(--gh-spacing-2) var(--gh-spacing-3);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  outline: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: var(--gh-font-section);
  line-height: var(--gh-leading-label);
  &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
  ${media.desktop} { font-size: var(--gh-font-emphasis); }
`;

const Submit = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--gh-spacing-1_5);
  min-block-size: var(--gh-size-9_5);
  padding-inline: var(--gh-spacing-3_5);
  border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  border-start-end-radius: ${({ theme }) => `max(0px, calc(${theme.radius.control} - ${theme.textField.borderWidth}))`};
  border-end-end-radius: ${({ theme }) => `max(0px, calc(${theme.radius.control} - ${theme.textField.borderWidth}))`};
  align-self: stretch;
  color: ${({ theme }) => theme.color.link};
  background: ${({ theme }) => theme.color.surfaceMuted};
  font: inherit;
  font-size: var(--gh-font-emphasis);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  white-space: nowrap;
  cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus};
    outline-offset: calc(-1 * var(--gh-size-1));
  }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
`;

/** A single search field with an inset action; its parent form owns submission. */
export function FeedSearchInput({ label, submitLabel, submitDisabled, compact = false, mobile = false, ...props }: FeedSearchInputProps) {
  const generated = useId(), id = props.id ?? generated;
  const input = <Input {...props} placeholder=" " id={id} type="search" aria-label={label} enterKeyHint={mobile ? "search" : props.enterKeyHint} />;
  const submit = <Submit type="submit" data-feed-search-submit disabled={props.disabled || submitDisabled}
    aria-label={mobile ? submitLabel : undefined} title={mobile ? submitLabel : undefined}>
    {(mobile || !compact) && <SearchIcon aria-hidden="true" />}{!mobile && submitLabel}
  </Submit>;
  return <Field data-feed-search data-floating-control $compact={compact} $mobile={mobile}>
    <label htmlFor={id} title={label}>{label}</label>
    <FloatingOutline label={label} />
    {input}
    {submit}
  </Field>;
}
