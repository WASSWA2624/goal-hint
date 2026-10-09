"use client";

import { useSyncExternalStore } from "react";
import { Button, ButtonLink, TextLink } from "@/components/ui/controls";
import { Inline, MutedText, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { feedPageHref, feedPaginationRules, type FeedPaginationError, type LoadedFeed } from "@/domain/feed-pagination";
import type { FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";

const subscribe = () => () => {};
const client = () => true, server = () => false;
export function FeedPagination({ query, today, view, busy, error, onLoadMore, onRetry }: {
  query: FeedQuery; today: ReportingDate; view: LoadedFeed; busy: boolean; error: FeedPaginationError["code"] | null;
  onLoadMore: () => void; onRetry: () => void;
}) {
  const enhanced = useSyncExternalStore(subscribe, client, server), messages = createMessages(query.locale);
  const next = view.data.nextPage, previous = view.firstPage > 1 ? Math.max(1, Math.min(view.firstPage - 1, view.data.totalPages)) : null;
  const changed = error === "changed" || error === "stale-data";
  const canAppend = view.pages < feedPaginationRules.maximumLoadedPages && view.data.paginationVersion !== null;
  return <nav aria-label={messages.text("feed.pagination.navigation")}>
    <Stack $gap="sm">
      {view.data.totalPages > 0 && <MutedText>{messages.text(view.firstPage === view.lastPage ? "feed.pagination.page" : "feed.pagination.position", {
        first: messages.number(view.firstPage), last: messages.number(view.lastPage), total: messages.number(view.data.totalPages) })}</MutedText>}
      {error && <MutedText>{messages.text(changed ? "feed.pagination.changed" : error === "rate-limited" ? "feed.pagination.busy" : "feed.pagination.failed")}</MutedText>}
      <Inline>
        {error ? <Button onClick={onRetry} disabled={busy} data-pagination-retry>
          {messages.text(changed ? "feed.pagination.refresh" : "feed.pagination.retry")}
        </Button> : next !== null && (enhanced && canAppend
          ? <Button onClick={onLoadMore} disabled={busy} data-load-more>{messages.text(busy ? "feed.pagination.loading" : "feed.pagination.loadMore")}</Button>
          : <ButtonLink href={feedPageHref(query, today, next)} prefetch={false}>{messages.text("feed.pagination.loadMore")}</ButtonLink>)}
        {previous !== null && <TextLink href={feedPageHref(query, today, previous)} prefetch={false}>{messages.text("feed.pagination.previous")}</TextLink>}
        {next !== null && <TextLink href={feedPageHref(query, today, next)} prefetch={false}>{messages.text("feed.pagination.next")}</TextLink>}
      </Inline>
      {next !== null && !canAppend && <MutedText>{messages.text("feed.pagination.continue")}</MutedText>}
    </Stack>
  </nav>;
}
