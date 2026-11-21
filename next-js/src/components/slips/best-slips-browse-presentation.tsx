"use client";

import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsQueryRules } from "@/domain/best-slips-query";
import { createMessages } from "@/i18n/messages";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { desktopContentPadding } from "@/components/ui/layout";
import { FilterButton } from "./best-slips-filter-styles";

const Pagination = styled(PagePaginationSection)`
  ${desktopContentPadding()}
  [aria-current="page"] { background: ${({ theme }) => theme.color.accent.blue.text}; color: ${({ theme }) => theme.color.accent.blue.soft}; }
  ${media.belowDesktop} {
    > nav { --pagination-min-cell: var(--gh-size-8); --pagination-gap: var(--gh-spacing-1); font-size: var(--gh-font-secondary); }
  }
`;
const ArchiveControls = styled.nav`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2); align-items: center; justify-content: space-between;
`;

export function BestSlipsSummary({ result, locale }: { result: SlipsBrowseResult; locale: string }) {
  const m = createMessages(locale), browse = result.browse;
  const total = browse?.total ?? (browse ? null : result.slips.length);
  const first = result.slips.length ? ((browse?.firstPage ?? browse?.query.page ?? 1) - 1) * (browse?.pageSize ?? result.slips.length) + 1 : 0;
  const last = result.slips.length ? first + result.slips.length - 1 : 0;
  const description = total === null ? m.text("bestSlips.filters.shown", { count: m.number(result.slips.length) })
    : result.slips.length > 0 ? m.plural("bestSlips.filters.showing", total, { first: m.number(first), last: m.number(last), total: m.number(total) })
      : m.plural("bestSlips.filters.matchingCount", total);
  return <output data-best-slips-summary>{description}</output>;
}

export function BestSlipsArchivePagination({ query, nextCursor, onFirst, onOlder, locale, busy }: {
  query: NonNullable<SlipsBrowseResult["browse"]>["query"]; nextCursor: string | null;
  onFirst: () => void; onOlder: () => void; locale: string; busy: boolean;
}) {
  const m = createMessages(locale), showOlder = Boolean(nextCursor) && query.page < bestSlipsQueryRules.maximumPage;
  if (!query.cursor && !showOlder) return null;
  return <Pagination data-best-slips-archive-pagination><ArchiveControls aria-label={m.text("bestSlips.filters.archivePagination")}>
    {query.cursor && <FilterButton type="button" onClick={onFirst} disabled={busy}>{m.text("bestSlips.filters.firstArchivePage")}</FilterButton>}
    <span>{m.text("bestSlips.filters.page", { page: m.number(query.page) })}</span>
    {showOlder && <FilterButton type="button" onClick={onOlder} disabled={busy}>{m.text("bestSlips.filters.olderSlips")}</FilterButton>}
  </ArchiveControls></Pagination>;
}

export function BestSlipsPagination({ onPage, total, page, busy, locale }: {
  onPage: (page: number) => void; total: number; page: number; busy: boolean; locale: string;
}) {
  const m = createMessages(locale);
  const pages = Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(total / bestSlipsQueryRules.pageSize));
  return pages > 1 ? <Pagination data-best-slips-pagination><NumberedPagination page={page} pages={pages} disabled={busy}
    onPage={onPage} labels={numberedPaginationLabels(m, m.text("bestSlips.title"))} /></Pagination> : null;
}
