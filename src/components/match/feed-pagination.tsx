"use client";

import Link from "next/link";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { paginationListStyles } from "@/components/ui/pagination-styles";
import type { ReportingDate } from "@/domain/calendar";
import { feedPageHref, type FeedPaginationError } from "@/domain/feed-pagination";
import { paginationItems } from "@/domain/feed-presentation";
import type { FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const desktop = media.desktop;
const Bar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; ${desktop} { font-size: 0.875rem; } }
  > nav { inline-size: 100%; min-inline-size: 0; }
`;
/** Always one row: buttons shrink together on narrow phones instead of wrapping. */
const Pages = styled.ol`
  ${paginationListStyles}
`;

/** Numbered pages: ‹ 1 2 3 4 … N ›. Every page is an ordinary link for crawlers and keyboards. */
export function FeedPagination({ query, today, data, busy, error, onRetry }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse; busy: boolean; error: FeedPaginationError["code"] | null; onRetry: () => void;
}) {
  const messages = createMessages(query.locale), page = data.page, total = data.totalPages;
  const first = data.total === 0 ? 0 : (page - 1) * data.pageSize + 1, last = Math.min(data.total, (page - 1) * data.pageSize + data.records.length);
  const changed = error === "changed" || error === "stale-data";
  if (total < 1) return null;
  const arrow = (target: number | null, direction: "previous" | "next") => {
    const Icon = direction === "previous" ? ChevronLeftIcon : ChevronRightIcon, label = messages.text(`feed.pagination.${direction}`);
    return <li>{target === null ? <span aria-disabled="true" title={label}><Icon /></span>
      : <Link href={feedPageHref(query, today, target)} prefetch={false} aria-label={label} title={label} rel={direction === "previous" ? "prev" : "next"}><Icon /></Link>}</li>;
  };
  return <Bar>
    <p>{messages.text("feed.results.showing", { shown: `${messages.number(first)}–${messages.number(last)}`, total: messages.number(data.total) })}</p>
    {error && <p role="alert">{messages.text(changed ? "feed.pagination.changed" : error === "rate-limited" ? "feed.pagination.busy" : "feed.pagination.failed")}
      {" "}<Button variant="quiet" onClick={onRetry} disabled={busy} data-pagination-retry>{messages.text(changed ? "feed.pagination.refresh" : "feed.pagination.retry")}</Button></p>}
    <nav aria-label={messages.text("feed.pagination.navigation")}>
      <Pages>
        {arrow(data.previousPage, "previous")}
        {paginationItems(page, total).map((item) => item.kind === "gap"
          ? <li key={item.key}><span data-gap aria-label={messages.text("feed.pagination.gap")} role="img">…</span></li>
          : <li key={item.page}><Link href={feedPageHref(query, today, item.page)} prefetch={false} aria-current={item.current ? "page" : undefined}
            aria-label={messages.text("feed.pagination.pageLink", { page: messages.number(item.page) })}>{messages.number(item.page)}</Link></li>)}
        {arrow(data.nextPage, "next")}
      </Pages>
    </nav>
  </Bar>;
}
