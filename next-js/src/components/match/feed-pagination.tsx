"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { desktopContentPadding } from "@/components/ui/layout";
import { ShowMore } from "@/components/ui/show-more";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import type { FeedPaginationError } from "@/domain/feed-pagination";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const desktop = media.desktop;
const Bar = styled(PagePaginationSection)`
  ${desktopContentPadding()}
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-2);
  padding-block-start: var(--gh-spacing-3);
  background: ${({ theme }) => theme.color.page};
  border-block-start: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.phoneCardFrame.separator};
  overflow-anchor: none;
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); ${desktop} { font-size: var(--gh-font-emphasis); } }
`;

export function FeedPagination({ locale, data, busy, loadingMore, appendError, onShowMore, error, onRetry,
  firstPage = data.page, shown = data.records.length }: {
  firstPage?: number; shown?: number;
  locale: string; data: MatchFeedResponse; busy: boolean; loadingMore: boolean; appendError: boolean;
  onShowMore: () => void; error: FeedPaginationError["code"] | null; onRetry: () => void;
}) {
  const messages = createMessages(locale);
  const first = data.total === 0 ? 0 : (firstPage - 1) * data.pageSize + 1, last = Math.min(data.total, (firstPage - 1) * data.pageSize + shown);
  const changed = error === "changed" || error === "stale-data";
  if (data.totalPages < 1 && !error) return null;
  return <Bar data-feed-pagination>
    <ShowMore hasMore={data.nextPage !== null} onShowMore={onShowMore} messages={messages}
      disabled={busy} loading={loadingMore} failed={appendError} />
    <p>{messages.text("feed.results.showing", { shown: `${messages.number(first)}–${messages.number(last)}`, total: messages.number(data.total) })}</p>
    {error && <p role="alert">{messages.text(changed ? "feed.pagination.changed" : error === "rate-limited" ? "feed.pagination.busy" : "feed.pagination.failed")}
      {" "}<Button variant="quiet" onClick={onRetry} disabled={busy} data-pagination-retry>{messages.text(changed ? "feed.pagination.refresh" : "feed.pagination.retry")}</Button></p>}
  </Bar>;
}
