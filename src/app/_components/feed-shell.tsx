import "server-only";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import { type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, feedQueryKey, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { FeedStateProvider } from "@/state/provider";
import { PublicShell } from "./public-shell";

/** Interim presentation only. Prompt 032 replaces this with the stored match feed. */
export function FeedShell({ query, today }: { query: FeedQuery; today: ReportingDate }) {
  const messages = createMessages(query.locale);
  const range = resolveFeedDates(query, today);
  const providerKey = `${feedQueryKey(query, today)}:${feedQueryHref(query, today)}`;
  return (
    <PublicShell locale={query.locale} current={query.status === "finished" ? "results" : "today"}>
      <FeedStateProvider key={providerKey} initial={{ query, today, data: null }}>
        <Stack $gap="lg">
          <Stack $gap="sm">
            <PageHeading>{messages.text("feed.title")}</PageHeading>
            <BodyText>
              <time dateTime={range.startDate}>{messages.reportingDate(range.startDate)}</time>
              {range.dayCount > 1 && <> – <time dateTime={range.endDate}>{messages.reportingDate(range.endDate)}</time></>}
              {" · "}{messages.text("feed.reportingTimeZone")}
            </BodyText>
            <MutedText>{messages.text(`feed.status.${query.status}`)}</MutedText>
          </Stack>
          <EmptyState title={messages.text("feed.interimTitle")} description={messages.text("feed.interimDescription")} />
        </Stack>
      </FeedStateProvider>
    </PublicShell>
  );
}
