import "server-only";

import { TextLink } from "@/components/ui/controls";
import { BodyText, Inline, SectionHeading, Stack } from "@/components/ui/layout";
import { contactNotice } from "@/domain/contact-notice";
import { informationHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { InformationNotice } from "./information-notice";

export function ContactContent({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  return <Stack $gap="xl" data-contact-status={contactNotice.publication} data-contact-release-ready={contactNotice.releaseReady}>
    <InformationNotice locale={locale} kind="contact" reviewedOn={contactNotice.reviewedOn} />
    <Stack as="section" id="contact-report" aria-labelledby="contact-report-heading" $gap="md">
      <SectionHeading id="contact-report-heading">{messages.text("contact.report.title")}</SectionHeading>
      <BodyText>{messages.text("contact.report.body")}</BodyText>
      <ul>{(["match", "issue", "source"] as const).map((detail) =>
        <li key={detail}><BodyText>{messages.text(`contact.report.${detail}`)}</BodyText></li>)}</ul>
      <BodyText>{messages.text("contact.report.minimise")}</BodyText>
    </Stack>
    <Stack as="section" id="contact-corrections" aria-labelledby="contact-corrections-heading" $gap="md">
      <SectionHeading id="contact-corrections-heading">{messages.text("contact.corrections.title")}</SectionHeading>
      <BodyText>{messages.text("contact.corrections.body")}</BodyText>
      <TextLink href={`${informationHref("how-it-works", locale)}#settlement`} prefetch={false}>{messages.text("contact.corrections.link")}</TextLink>
    </Stack>
    <Stack as="section" id="contact-policies" aria-labelledby="contact-policies-heading" $gap="md">
      <SectionHeading id="contact-policies-heading">{messages.text("contact.policies.title")}</SectionHeading>
      <nav aria-label={messages.text("contact.policies.navigation")}><Inline>
        {(["privacy", "terms", "how-it-works"] as const).map((page) =>
          <TextLink key={page} href={informationHref(page, locale)} prefetch={false}>{messages.text(`navigation.${page}`)}</TextLink>)}
      </Inline></nav>
    </Stack>
  </Stack>;
}
