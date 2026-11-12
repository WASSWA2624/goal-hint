"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { CheckIcon, ResetIcon, SlidersIcon } from "./icons";
import { CriteriaDialog, CriteriaDialogButton, CriteriaDialogTitle } from "./criteria-dialog";

const ResetButton = styled(CriteriaDialogButton)`
  &&:not(:disabled) {
    background: ${({ theme }) => theme.color.fieldHover};
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.brandHover}; } }
  }
`;

export const FilterDialogSurface = styled(CriteriaDialog)`
  @media (max-width: ${({ theme }) => theme.viewport[22.5]}) {
    &&[data-enhanced="true"] {
      inline-size: calc(100vw - var(--gh-size-4));
      max-inline-size: calc(100vw - var(--gh-size-4));
      > div { padding-inline: var(--gh-spacing-2_5); }
    }
  }
`;

type FiltersDialogProps = {
  id: string; open: boolean; onCancel: () => void; closeLabel: string; group?: string; className?: string;
  locale?: string; onReset: () => void; onApply: () => void; applyDisabled?: boolean;
  children: ReactNode; title?: string;
};

/** Shared heading and footer actions for screen-specific filter drafts. */
export function FiltersDialog({ locale, onReset, onApply, applyDisabled = false, children, title, ...props }: FiltersDialogProps) {
  const messages = createMessages(locale);
  return <FilterDialogSurface {...props} onApply={onApply} applyDisabled={applyDisabled}
    title={<CriteriaDialogTitle><SlidersIcon />{title ?? messages.text("filters.title")}</CriteriaDialogTitle>}
    footer={<>
      <ResetButton type="button" variant="secondary" data-dialog-reset onClick={onReset}>
        <ResetIcon />{messages.text("feed.filters.resetFilters")}
      </ResetButton>
      <CriteriaDialogButton type="button" disabled={applyDisabled} onClick={onApply}>
        <CheckIcon />{messages.text("feed.filters.applyFilters")}
      </CriteriaDialogButton>
    </>}>
    {children}
  </FilterDialogSurface>;
}

export function AdvancedFilterDialog(props: FiltersDialogProps) {
  return <FiltersDialog {...props} title={createMessages(props.locale).text("feed.filters.dialogTitle")} />;
}

export const FilterDialogContent = styled.div`
  display: grid; gap: var(--gh-spacing-2_5); min-inline-size: 0;
`;

export const FilterDialogSection = styled.div.attrs<{ "data-filter-section"?: string }>({ "data-filter-section": "" })`
  min-inline-size: 0;
  &:not([hidden]) + &:not([hidden]) {
    padding-block-start: var(--gh-spacing-2);
    border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  }
`;

export const FilterFieldRow = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2_5);
`;

export const FilterDateTimeRow = styled(FilterFieldRow)`
  gap: var(--gh-spacing-1_5);
  > [data-date-time-field] { container-type: inline-size; }
  @container (max-width: ${({ theme }) => theme.size[44]}) {
    && [data-date-time-input="datetime"] {
      padding-inline: var(--gh-spacing-0_75) var(--gh-size-6_5); font-size: var(--gh-font-caption);
      > input { flex: 0 0 auto; inline-size: var(--gh-size-3_5); }
      > [data-date-part="month"] { inline-size: var(--gh-size-6); }
      > [data-date-part="year"] { inline-size: var(--gh-size-6_5); }
    }
    && [data-date-time-picker-trigger] { inline-size: var(--gh-size-5_5); }
  }
  @container (min-width: ${({ theme }) => theme.size[40]}) and (max-width: ${({ theme }) => theme.size[44]}) {
    && [data-date-time-input="datetime"] {
      font-size: var(--gh-font-secondary);
      > input { inline-size: var(--gh-size-4); }
      > [data-date-part="month"] { inline-size: var(--gh-size-7); }
      > [data-date-part="year"] { inline-size: var(--gh-size-8); }
    }
  }
`;

export const FilterSection = styled.fieldset`
  min-inline-size: 0; margin: 0; padding: 0; border: 0;
  > legend {
    margin-block-end: var(--gh-spacing-1_5); padding: 0;
    color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-body); font-weight: var(--gh-weight-medium);
  }
`;
