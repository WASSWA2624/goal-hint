"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import styled from "styled-components";
import { searchMarketFilters, type MarketFilterMatches } from "@/domain/market-filter-search";
import { createMessages } from "@/i18n/messages";
import { CriteriaDialog, CriteriaDialogButton, CriteriaDialogTitle } from "./criteria-dialog";
import { dialogSurface } from "./dialog-surfaces";
import { FilterDialogTrigger } from "./filter-dialog-trigger";
import { focusRing } from "./filter-chrome";
import { ChartIcon, CheckIcon, ResetIcon } from "./icons";
import { MutedText } from "./layout";
import { SearchBar } from "./search-bar";

const MarketRow = styled.div`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  > button { inline-size: 100%; }
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); overflow-wrap: anywhere; }
  [data-enhanced="false"] & { display: none; }
`;

const SearchHeader = styled.div`
  position: sticky; inset-block-start: 0; z-index: var(--gh-layer-raised);
  display: grid; gap: var(--gh-spacing-2);
  padding-block-end: var(--gh-spacing-2_5);
  ${dialogSurface}
  [data-enhanced="false"] & { display: none; }
`;
const SelectionFooter = styled.div`
  flex: 1 1 100%;
  min-inline-size: 0;
`;

export function MarketFilterControl({ dialogId, summary, children, ...props }:
  Omit<ComponentProps<typeof FilterDialogTrigger>, "icon"> & { summary: ReactNode }) {
  const summaryId = `${dialogId}-summary`;
  return <MarketRow data-market-section>
    <FilterDialogTrigger {...props} dialogId={dialogId} icon={<ChartIcon />} aria-describedby={summaryId} data-market-trigger>
      {children}
    </FilterDialogTrigger>
    <span id={summaryId}>{summary}</span>
  </MarketRow>;
}

export const MarketFilterChoice = styled.label`
  display: flex; align-items: center; gap: var(--gh-spacing-1_5);
  min-inline-size: 0; min-block-size: var(--form-control-height);
  color: ${({ theme }) => theme.color.text}; font-size: var(--gh-font-body); cursor: pointer;
  &[hidden] { display: none; }
  > input {
    flex: none; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); margin: 0;
    accent-color: ${({ theme }) => theme.color.brand}; ${focusRing}
  }
`;

type PublishedMarketBody = Readonly<{
  views: ReactNode; summary: ReactNode; fallback: ReactNode; resultsBusy: boolean; results(query: string): ReactNode;
}>;
type MarketFilterBody = { children: (matches: MarketFilterMatches | null) => ReactNode; published?: never } |
  { children?: never; published: PublishedMarketBody };

export function MarketFilterDialog({ id, locale, open, children, published, onApply, onCancel, onReset, ...props }: {
  locale: string; id: string; open: boolean; group?: string;
  onApply: () => void; onCancel: () => void; onReset?: () => void;
} & MarketFilterBody) {
  const messages = createMessages(locale);
  const title = messages.text("feed.filters.markets");
  const resultsId = `${id}-results`;
  const [search, setSearch] = useState({ open, query: "" });
  if (search.open !== open) setSearch({ open, query: "" });
  const query = search.open === open ? search.query : "";
  const matches = open && !published ? searchMarketFilters(query, messages) : null;

  return <CriteriaDialog {...props} id={id} open={open} onCancel={onCancel} onApply={onApply}
    closeLabel={messages.text("feed.filters.closeSection", { section: title })}
    title={<CriteriaDialogTitle><ChartIcon />{title}</CriteriaDialogTitle>}
    footer={<>
      {published?.summary && <SelectionFooter>{published.summary}</SelectionFooter>}
      {onReset && <CriteriaDialogButton type="button" variant="secondary" data-dialog-reset onClick={onReset}>
        <ResetIcon />{messages.text("feed.filters.reset")}
      </CriteriaDialogButton>}
      <CriteriaDialogButton type="button" variant="quiet" onClick={onCancel}>{messages.text("feed.filters.cancel")}</CriteriaDialogButton>
      <CriteriaDialogButton type="button" onClick={onApply}><CheckIcon />{messages.text("filters.apply")}</CriteriaDialogButton>
    </>}>
    {open && <SearchHeader>
      <SearchBar label={messages.text("filters.searchMarkets")} aria-controls={resultsId} value={query} autoComplete="off"
        onChange={event => setSearch({ open, query: event.currentTarget.value })}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
        }} />
      {published?.views}
    </SearchHeader>}
    <div id={resultsId} aria-busy={published?.resultsBusy}>
      {matches && matches.families.size === 0 && matches.outcomes.size === 0 &&
        <MutedText role="status">{messages.text("filters.noMatchingMarkets")}</MutedText>}
      {published ? open ? published.results(query) : published.fallback : children(matches)}
    </div>
  </CriteriaDialog>;
}
