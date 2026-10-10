import "server-only";

import { TextLink } from "@/components/ui/controls";
import { BodyText, Inline, SectionHeading, Stack } from "@/components/ui/layout";
import { termsNotice } from "@/domain/terms-notice";
import { informationHref } from "@/domain/navigation";
import { createMessages, type TextKey } from "@/i18n/messages";
import { InformationNotice } from "./information-notice";

const sections = ["service", "estimates", "updates", "outcomes", "use", "sources", "privacy", "release"] as const;
const paragraphs = { service: ["body", "markets"], estimates: ["body", "sources"], updates: ["body", "limits"],
  outcomes: ["body", "process"], use: ["body"], sources: ["body", "permissions"], privacy: ["body"], release: ["body"] } as const;
const links: Partial<Record<typeof sections[number], readonly { href: string; key: TextKey }[]>> = {
  estimates: [{ href: "/en/how-it-works#probabilities", key: "terms.link.probabilities" },
    { href: "/en/how-it-works#evidence", key: "terms.link.evidence" },
    { href: "/en/how-it-works#performance", key: "terms.link.performance" }],
  updates: [{ href: "/en/how-it-works#schedule", key: "terms.link.schedule" }],
  outcomes: [{ href: "/en/how-it-works#settlement", key: "terms.link.settlement" },
    { href: "/en/how-it-works#corrections", key: "terms.link.corrections" }],
  privacy: [{ href: "/en/privacy", key: "terms.link.privacy" }],
};

export function TermsContent({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  return <Stack $gap="xl" data-terms-status={termsNotice.publication} data-terms-release-ready={termsNotice.releaseReady}>
    <InformationNotice locale={locale} kind="terms" reviewedOn={termsNotice.reviewedOn} />
    <nav aria-label={messages.text("terms.contents")}><Inline>
      {sections.map((id) => <TextLink key={id} href={`#terms-${id}`} prefetch={false}>{messages.text(`terms.${id}.title`)}</TextLink>)}
    </Inline></nav>
    {sections.map((id) => <Stack as="section" id={`terms-${id}`} key={id} aria-labelledby={`terms-${id}-heading`} $gap="md">
      <SectionHeading id={`terms-${id}-heading`}>{messages.text(`terms.${id}.title`)}</SectionHeading>
      {paragraphs[id].map((part) => <BodyText key={part}>{messages.text(`terms.${id}.${part}` as TextKey)}</BodyText>)}
      {links[id] && <Inline>{links[id].map(({ href, key }) => <TextLink key={key} href={href} prefetch={false}>{messages.text(key)}</TextLink>)}</Inline>}
      {id === "outcomes" && <TextLink href={informationHref("contact", locale)} prefetch={false}>{messages.text("contact.link")}</TextLink>}
      {id === "release" && <ul>{termsNotice.blockers.map((blocker) => <li key={blocker}><BodyText>{messages.text(`terms.blocker.${blocker}`)}</BodyText></li>)}</ul>}
    </Stack>)}
  </Stack>;
}
