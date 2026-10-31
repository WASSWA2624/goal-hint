"use client";

import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import type { BestSlipsResult } from "@/domain/best-slips";
import { bestSlipsQueryRules } from "@/domain/best-slips-query";
import { createMessages } from "@/i18n/messages";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { desktopContentPadding } from "@/components/ui/layout";

const Pagination = styled.div`
  ${desktopContentPadding()}
  [aria-current="page"] { background: ${({ theme }) => theme.color.accent.blue.text}; color: ${({ theme }) => theme.color.accent.blue.soft}; }
  ${media.belowDesktop} {
    > nav { --pagination-min-cell: 2rem; --pagination-cell-height: var(--pagination-min-cell); --pagination-gap: 4px; font-size: .75rem; }
  }
`;

export function BestSlipsSummary({ result, period, locale }: { result: BestSlipsResult; period: string; locale: string }) {
  const m = createMessages(locale), browse = result.browse;
  const total = browse?.total ?? (browse ? null : result.slips.length);
  const first = result.slips.length ? ((browse?.query.page ?? 1) - 1) * (browse?.pageSize ?? result.slips.length) + 1 : 0;
  const dates = browse?.total === null ? browse.from && browse.to
    ? m.text("bestSlips.filters.allDatesRange", { from: m.reportingDateMedium(browse.from), to: m.reportingDateMedium(browse.to) }) : period : null;
  return <span data-best-slips-summary>
    <span>{total === null ? m.text("bestSlips.filters.shown", { count: m.number(result.slips.length) })
      : m.text("bestSlips.filters.showing", { first: m.number(first), last: m.number(result.slips.length ? first + result.slips.length - 1 : 0), total: m.number(total) })}</span>
    {dates && <span> · {dates}</span>}
  </span>;
}

export function BestSlipsPagination({ onPage, total, page, busy, locale }: {
  onPage: (page: number) => void; total: number; page: number; busy: boolean; locale: string;
}) {
  const m = createMessages(locale);
  const pages = Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(total / bestSlipsQueryRules.pageSize));
  return pages > 1 ? <Pagination data-best-slips-pagination><NumberedPagination page={page} pages={pages} disabled={busy}
    onPage={onPage} labels={numberedPaginationLabels(m, m.text("slips.generated"))} /></Pagination> : null;
}
