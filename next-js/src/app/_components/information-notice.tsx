import "server-only";

import { BodyText, MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { parseReportingDate } from "@/domain/calendar";
import { createContentMessages } from "@/i18n/content-messages";

export function publishedNoticeDate(notice: Readonly<{ releaseReady: boolean; effectiveOn: string | null }>): string | null {
  return notice.releaseReady ? notice.effectiveOn : null;
}

/** The effective date and review date have separate meanings. */
export function InformationNotice({ locale, kind, reviewedOn, effectiveOn }: {
  locale: string; kind: "privacy" | "terms"; reviewedOn: string; effectiveOn: string | null;
}) {
  const messages = createContentMessages(locale);
  const statusId = `${kind}-status-heading`;
  return <>
    <Stack $gap="sm">
      <BodyText>{messages.text(`${kind}.intro`)}</BodyText>
      {effectiveOn && <MutedText><time dateTime={effectiveOn} data-notice-effective>{messages.text(`${kind}.effective`, {
        date: messages.reportingDate(parseReportingDate(effectiveOn)) })}</time></MutedText>}
      <MutedText><time dateTime={reviewedOn}>{messages.text(`${kind}.reviewed`, {
        date: messages.reportingDate(parseReportingDate(reviewedOn)) })}</time></MutedText>
      {!effectiveOn && <MutedText>{messages.text(`${kind}.reviewScope`)}</MutedText>}
    </Stack>
    {!effectiveOn && <Surface aria-labelledby={statusId}><Stack $gap="md">
      <SectionHeading id={statusId}>{messages.text(`${kind}.status.title`)}</SectionHeading>
      <BodyText>{messages.text(`${kind}.status.body`)}</BodyText>
    </Stack></Surface>}
  </>;
}
