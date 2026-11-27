"use client";

import { ShowMore } from "@/components/ui/show-more";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { createMessages } from "@/i18n/messages";
import styled from "styled-components";
import { desktopContentPadding } from "@/components/ui/layout";

const Pagination = styled(PagePaginationSection)`
  ${desktopContentPadding()}
`;

export function BestSlipsSummary({ result, locale }: { result: SlipsBrowseResult; locale: string }) {
  const m = createMessages(locale), browse = result.browse;
  const bandTotal = browse?.query.period !== "all" && browse?.from && browse.from === browse.to ? browse.bandTotal : null;
  const limit = browse?.dailyBandLimit;
  const total = browse?.total ?? (browse ? null : result.slips.length);
  const first = result.slips.length ? ((browse?.firstPage ?? browse?.query.page ?? 1) - 1) * (browse?.pageSize ?? result.slips.length) + 1 : 0;
  const last = result.slips.length ? first + result.slips.length - 1 : 0;
  const description = total === null ? m.text("bestSlips.filters.shown", { count: m.number(result.slips.length) })
    : result.slips.length > 0 ? m.plural("bestSlips.filters.showing", total, { first: m.number(first), last: m.number(last), total: m.number(total) })
      : m.plural("bestSlips.filters.matchingCount", total);
  const published = bandTotal == null ? null : limit === undefined
    ? m.plural("bestSlips.filters.publishedCount", bandTotal)
    : m.text("bestSlips.filters.publishedDailyCount", { count: m.number(bandTotal), limit: m.number(limit) });
  const showMatches = published === null || total !== bandTotal || result.slips.length !== bandTotal;
  return <output data-best-slips-summary>
    {published !== null && <span data-best-slips-band-count>{published}</span>}
    {showMatches && <span data-best-slips-match-count>{description}</span>}
  </output>;
}

export function BestSlipsPagination({ onShowMore, hasMore, loading, failed, disabled, locale }: {
  onShowMore: () => void; hasMore: boolean; loading: boolean; failed: boolean; disabled: boolean; locale: string;
}) {
  if (!hasMore) return null;
  return <Pagination data-best-slips-pagination><ShowMore hasMore onShowMore={onShowMore} messages={createMessages(locale)}
    loading={loading} failed={failed} disabled={disabled} /></Pagination>;
}
