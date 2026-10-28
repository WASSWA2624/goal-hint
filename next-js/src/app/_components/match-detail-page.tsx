import "server-only";

import { LiveMatchDetail } from "@/components/match/live-match-detail";
import { RevisionHistory } from "./revision-history";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeading, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import type { InsightsPreview } from "@/domain/match-insights";
import type { DetailPageResult } from "@/server/matches/detail-page";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

export function MatchDetailPage({ result, today, locale = "en", retryHref, historyResult = result, historyQuery = "", preview = null, previewPromise, showAccount = false, offer = null }: {
  result: DetailPageResult; today: ReportingDate; locale?: string; retryHref: string;
  historyResult?: DetailPageResult; historyQuery?: string; preview?: InsightsPreview | null; previewPromise?: Promise<InsightsPreview | null>;
  showAccount?: boolean; offer?: SubscriptionOffer | null;
}) {
  const messages = createMessages(locale);
  return <PublicShell showAccount={showAccount} locale={locale} today={today} app={result.data !== null} current="today">
    {result.data ? <LiveMatchDetail showAccount={showAccount} offer={offer} initial={result.data} today={today} locale={locale} preview={preview}
      {...(previewPromise ? { previewPromise } : {})} historyRequested={historyQuery !== ""}>
      <RevisionHistory current={result.data} result={historyResult} query={historyQuery} locale={locale} open />
    </LiveMatchDetail> : <Stack>
      <PageHeading>{messages.text("detail.unavailableTitle")}</PageHeading>
      <EmptyState title={messages.text(result.error === "rate-limited" ? "detail.rateLimited" : "detail.unavailable")}
        description={messages.text("detail.retryDescription")}
        action={<ButtonLink href={retryHref} prefetch={false}>{messages.text("feed.retry")}</ButtonLink>} />
    </Stack>}
  </PublicShell>;
}
