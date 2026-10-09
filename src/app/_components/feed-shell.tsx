import "server-only";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import { type FeedView } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

/** Interim presentation only. Prompt 032 replaces this with the stored match feed. */
export function FeedShell({ locale, view }: { locale: string; view: FeedView }) {
  const messages = createMessages(locale);
  return (
    <PublicShell locale={locale} current={view.status === "finished" ? "results" : "today"}>
      <Stack $gap="lg">
        <Stack $gap="sm">
          <PageHeading>{messages.text("feed.title")}</PageHeading>
          <BodyText>
            <time dateTime={view.date}>{messages.reportingDate(view.date)}</time>
            {" · "}{messages.text("feed.reportingTimeZone")}
          </BodyText>
          <MutedText>{messages.text(`feed.status.${view.status}`)}</MutedText>
        </Stack>
        <EmptyState title={messages.text("feed.interimTitle")} description={messages.text("feed.interimDescription")} />
      </Stack>
    </PublicShell>
  );
}
