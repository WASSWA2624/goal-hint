"use client";

import { useId, type ComponentPropsWithRef, type Ref } from "react";
import styled, { css } from "styled-components";
import { controlBodyHeight, controlRow } from "./control-layout";
import { floatingControl, floatingFieldState, floatingLabel, floatingOutline } from "./floating-field-styles";
import { FloatingOutline } from "./floating-outline";
import { textFieldSurface } from "./filled-surfaces";
import { filterButtonColors, focusRing } from "./filter-chrome";
import { SearchIcon, SlidersIcon } from "./icons";
import { media } from "@/styles/theme";

export type SearchBarProps = Omit<ComponentPropsWithRef<"input">, "type" | "children" | "aria-label"> & {
  label: string;
  /** Omit for immediate filtering within an existing list or option picker. */
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Local actions inside another form use a button instead of submitting that form. */
  onSearch?: () => void;
  filterButtonRef?: Ref<HTMLButtonElement>;
  filters?: {
    label: string;
    accessibleLabel?: string;
    dialogId: string;
    open: boolean;
    onOpen: () => void;
    count?: number;
  };
};

const Row = styled.div`
  display: flex; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${controlRow}
`;
const Field = styled.div`
  container: search-field / inline-size;
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  flex: 1; min-inline-size: 0; margin-block-start: var(--floating-label-space);
  ${controlBodyHeight}
  ${textFieldSurface}
  border: var(--gh-stroke-thin) solid transparent;
  border-radius: ${({ theme }) => theme.radius.control};
  &:not([data-search-action]) { grid-template-columns: minmax(0, 1fr); }
  && > label { ${floatingLabel} grid-column: 1; grid-row: 1; max-inline-size: calc(100% - var(--gh-spacing-5)); }
  && > input {
    ${floatingControl}
    inline-size: 100%; min-inline-size: 0;
    min-block-size: 0; block-size: 100%; padding-inline: var(--gh-spacing-2_5);
    border: 0; border-radius: ${({ theme }) => theme.radius.none};
    color: ${({ theme }) => theme.color.text}; background: transparent; font: inherit;
    font-size: var(--gh-font-section);
    &:focus-visible { outline: none; }
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  }
  > [data-floating-outline] { ${floatingOutline} }
  ${floatingFieldState}
  &:has(> input:disabled) { background: ${({ theme }) => theme.textField.disabledBackground}; }
`;
const actionFeedback = css`
  transition: background-color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing},
    color ${({ theme }) => theme.motion.fast} ${({ theme }) => theme.motion.easing};
  ${media.hover} { &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.link} ${theme.opacity[18]! * 100}%, ${theme.color.brandSoft})`};
  } }
  &:active:not(:disabled) {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.link} ${theme.opacity[25]! * 100}%, ${theme.color.brandSoft})`};
  }
  &:focus-visible:not(:disabled) { background: ${({ theme }) => theme.color.brandSoft}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
const Submit = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-inline-size: calc(var(--form-control-height) - var(--gh-size-0_5));
  padding: 0 var(--gh-spacing-2_5); border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  border-start-end-radius: ${({ theme }) => theme.radius.control};
  border-end-end-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
  font: inherit; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium);
  white-space: nowrap; cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  > span { display: none; }
  ${media.desktop} { @container search-field (min-width: ${({ theme }) => theme.size[64]}) { > span { display: inline; } } }
  ${actionFeedback}
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-1)); }
`;
const Filters = styled.button`
  ${controlBodyHeight}
  ${filterButtonColors}
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-inline-size: var(--form-control-height); padding: 0 var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium); cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  > span, > b { display: none; }
  ${media.desktop} { > span, > b { display: inline; } }
  ${actionFeedback}
  ${focusRing}
`;

/** The enclosing form owns submission; each screen owns its advanced-filter dialog. */
export function SearchBar({ label, submitLabel, submitDisabled, onSearch, filters, filterButtonRef, className, onKeyDown, ...input }: SearchBarProps) {
  const generated = useId(), id = input.id ?? generated;
  return <Row className={className} data-search-bar data-control-field>
    <Field data-feed-search data-floating-control data-text-field-frame data-search-action={submitLabel ? "" : undefined}>
      <label htmlFor={id} title={label}>{label}</label><FloatingOutline label={label} />
      <input {...input} id={id} type="search" placeholder=" " aria-label={label} enterKeyHint="search" onKeyDown={event => {
        onKeyDown?.(event);
        if (onSearch && event.key === "Enter" && !event.defaultPrevented && !event.nativeEvent.isComposing) {
          event.preventDefault();
          if (!input.disabled && !submitDisabled) onSearch();
        }
      }} />
      {submitLabel && <Submit type={onSearch ? "button" : "submit"} onClick={onSearch} form={input.form} aria-label={submitLabel} title={submitLabel} data-feed-search-submit disabled={input.disabled || submitDisabled}>
        <SearchIcon aria-hidden="true" /><span>{submitLabel}</span>
      </Submit>}
    </Field>
    {filters && <Filters ref={filterButtonRef} type="button" aria-label={filters.accessibleLabel ?? filters.label}
      title={filters.accessibleLabel ?? filters.label} aria-haspopup="dialog" aria-controls={filters.dialogId}
      aria-expanded={filters.open} disabled={input.disabled} onClick={filters.onOpen} data-search-filters>
      <SlidersIcon aria-hidden="true" /><span>{filters.label}</span>{!!filters.count && <b aria-hidden="true">{filters.count}</b>}
    </Filters>}
  </Row>;
}
