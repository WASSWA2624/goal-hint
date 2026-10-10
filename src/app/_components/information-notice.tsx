import "server-only";

import { BodyText, MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { parseReportingDate } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";

/** Shared factual-review header; publication status is supplied by each document. */
export function InformationNotice({ locale, kind, reviewedOn }: {
  locale: string; kind: "privacy" | "terms" | "contact"; reviewedOn: string;
}) {
  const messages = createMessages(locale);
  const statusId = `${kind}-status-heading`;
  return <>
    <Stack $gap="sm">
      <BodyText>{messages.text(`${kind}.intro`)}</BodyText>
      <MutedText><time dateTime={reviewedOn}>{messages.text(`${kind}.reviewed`, {
        date: messages.reportingDate(parseReportingDate(reviewedOn)) })}</time></MutedText>
      <MutedText>{messages.text(`${kind}.reviewScope`)}</MutedText>
    </Stack>
    <Surface aria-labelledby={statusId}><Stack $gap="md">
      <SectionHeading id={statusId}>{messages.text(`${kind}.status.title`)}</SectionHeading>
      <BodyText>{messages.text(`${kind}.status.body`)}</BodyText>
    </Stack></Surface>
  </>;
}
