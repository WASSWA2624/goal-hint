"use client";

import { useId, type ComponentPropsWithRef, type Ref } from "react";
import styled from "styled-components";
import { controlBodyHeight, controlRow } from "./control-layout";
import { floatingControl, floatingFieldState, floatingLabel, floatingOutline } from "./floating-field-styles";
import { FloatingOutline } from "./floating-outline";
import { textFieldSurface } from "./filled-surfaces";
import { filterButtonColors, focusRing } from "./filter-chrome";
import { SearchIcon, SlidersIcon } from "./icons";
import { media } from "@/styles/theme";

export type SearchBarProps = Omit<ComponentPropsWithRef<"input">, "type" | "children" | "aria-label"> & {
  label: string;
  submitLabel: string;
  submitDisabled?: boolean;
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
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  flex: 1; min-inline-size: 0; margin-block-start: var(--floating-label-space);
  ${controlBodyHeight}
  ${textFieldSurface}
  border: var(--gh-stroke-thin) solid transparent;
  border-radius: ${({ theme }) => theme.radius.control};
  && > label { ${floatingLabel} max-inline-size: calc(100% - var(--form-control-height) - var(--gh-spacing-5)); }
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
`;
const Submit = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-inline-size: calc(var(--form-control-height) - var(--gh-size-0_5));
  padding: 0 var(--gh-spacing-2_5); border: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  border-start-end-radius: ${({ theme }) => theme.radius.control};
  border-end-end-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.surfaceMuted};
  font: inherit; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium);
  white-space: nowrap; cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  > span { display: none; }
  ${media.desktop} { > span { display: inline; } }
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-1)); }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
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
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; } }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; cursor: not-allowed; }
  ${focusRing}
`;

/** The enclosing form owns submission; each screen owns its advanced-filter dialog. */
export function SearchBar({ label, submitLabel, submitDisabled, filters, filterButtonRef, ...input }: SearchBarProps) {
  const generated = useId(), id = input.id ?? generated;
  return <Row data-search-bar data-control-field>
    <Field data-feed-search data-floating-control data-text-field-frame>
      <label htmlFor={id} title={label}>{label}</label><FloatingOutline label={label} />
      <input {...input} id={id} type="search" placeholder=" " aria-label={label} enterKeyHint="search" />
      <Submit type="submit" form={input.form} aria-label={submitLabel} title={submitLabel} data-feed-search-submit disabled={input.disabled || submitDisabled}>
        <SearchIcon aria-hidden="true" /><span>{submitLabel}</span>
      </Submit>
    </Field>
    {filters && <Filters ref={filterButtonRef} type="button" aria-label={filters.accessibleLabel ?? filters.label}
      title={filters.accessibleLabel ?? filters.label} aria-haspopup="dialog" aria-controls={filters.dialogId}
      aria-expanded={filters.open} disabled={input.disabled} onClick={filters.onOpen} data-search-filters>
      <SlidersIcon aria-hidden="true" /><span>{filters.label}</span>{!!filters.count && <b aria-hidden="true">{filters.count}</b>}
    </Filters>}
  </Row>;
}
