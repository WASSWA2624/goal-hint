"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import type { ReportingDate } from "@/domain/calendar";
import { feedPageHref, type FeedPaginationError } from "@/domain/feed-pagination";
import { feedQueryRules, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const desktop = media.desktop;
const Bar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  ${desktop} {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; ${desktop} { font-size: 0.875rem; } }
  > nav { inline-size: 100%; min-inline-size: 0; ${desktop} { flex: 1 1 16rem; inline-size: auto; max-inline-size: 100%; } }
`;

/** Numbers navigate; the surrounding arrows only scroll through the sequential number rail. */
export function FeedPagination({ query, today, data, busy, error, onRetry }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse; busy: boolean; error: FeedPaginationError["code"] | null; onRetry: () => void;
}) {
  const messages = createMessages(query.locale), page = data.page, total = data.totalPages;
  const first = data.total === 0 ? 0 : (page - 1) * data.pageSize + 1, last = Math.min(data.total, (page - 1) * data.pageSize + data.records.length);
  const changed = error === "changed" || error === "stale-data";
  if (total < 1) return null;
  return <Bar>
    <p>{messages.text("feed.results.showing", { shown: `${messages.number(first)}–${messages.number(last)}`, total: messages.number(data.total) })}</p>
    {error && <p role="alert">{messages.text(changed ? "feed.pagination.changed" : error === "rate-limited" ? "feed.pagination.busy" : "feed.pagination.failed")}
      {" "}<Button variant="quiet" onClick={onRetry} disabled={busy} data-pagination-retry>{messages.text(changed ? "feed.pagination.refresh" : "feed.pagination.retry")}</Button></p>}
    <NumberedPagination page={page} pages={Math.min(total, feedQueryRules.maximumPage)}
      labels={numberedPaginationLabels(messages, messages.text("feed.pagination.navigation"))} href={(target) => feedPageHref(query, today, target)} />
  </Bar>;
}
