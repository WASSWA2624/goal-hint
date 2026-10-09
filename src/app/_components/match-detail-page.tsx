import "server-only";

import type { ReactNode } from "react";
import { MatchDetail } from "./match-detail-content";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeading, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import type { DetailPageResult } from "@/server/matches/detail-page";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

export function MatchDetailPage({ result, today, locale = "en", retryHref, history }: {
  result: DetailPageResult; today: ReportingDate; locale?: string; retryHref: string; history?: ReactNode;
}) {
  const messages = createMessages(locale);
  return <PublicShell locale={locale} today={today}>
    {result.data ? <MatchDetail data={result.data} locale={locale} history={history} /> : <Stack>
      <PageHeading>{messages.text("detail.unavailableTitle")}</PageHeading>
      <EmptyState title={messages.text(result.error === "rate-limited" ? "detail.rateLimited" : "detail.unavailable")}
        description={messages.text("detail.retryDescription")}
        action={<ButtonLink href={retryHref} prefetch={false}>{messages.text("feed.retry")}</ButtonLink>} />
    </Stack>}
  </PublicShell>;
}
