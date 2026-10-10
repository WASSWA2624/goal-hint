import "server-only";

import { TextLink } from "@/components/ui/controls";
import { BodyText, SectionHeading, Stack } from "@/components/ui/layout";
import { restorationRules } from "@/domain/feed-navigation";
import { informationHref } from "@/domain/navigation";
import { privacyNotice } from "@/domain/privacy-notice";
import { createContentMessages, type ContentTextKey } from "@/i18n/content-messages";
import { publicCacheRules } from "@/server/cache/public-cache";
import { InformationNotice } from "./information-notice";
import { ContentsNav } from "./information-styles";

const sections = ["access", "requests", "search", "storage", "tracking", "images", "football", "retention", "choices", "release"] as const;

export function PrivacyContent({ locale }: { locale: string }) {
  const messages = createContentMessages(locale);
  const values = { entries: messages.number(restorationRules.maximumEntries), minutes: messages.number(restorationRules.maximumAgeMilliseconds / 60_000),
    seconds: messages.number(publicCacheRules.mutableMs / 1000), hours: messages.number(publicCacheRules.immutableMs / 3_600_000) };
  const paragraphs = { access: ["body"], requests: ["body", "logs"], search: ["body", "counter", "refresh"], storage: [],
    tracking: ["body", "scope"], images: ["body", "recipients"], football: ["body", "permissions"], retention: ["body", "expiry"],
    choices: ["body", "contact"], release: ["body"] } as const;
  return <Stack $gap="xl" data-privacy-status={privacyNotice.publication} data-privacy-release-ready={privacyNotice.releaseReady}>
    <InformationNotice locale={locale} kind="privacy" reviewedOn={privacyNotice.reviewedOn} />
    <ContentsNav aria-label={messages.text("privacy.contents")}>
      {sections.map((id) => <TextLink key={id} href={`#privacy-${id}`} prefetch={false}>{messages.text(`privacy.${id}.title`)}</TextLink>)}
    </ContentsNav>
    {sections.map((id) => <Stack as="section" id={`privacy-${id}`} key={id} aria-labelledby={`privacy-${id}-heading`} $gap="md">
      <SectionHeading id={`privacy-${id}-heading`}>{messages.text(`privacy.${id}.title`)}</SectionHeading>
      {paragraphs[id].map((part) => <BodyText key={part}>{messages.text(`privacy.${id}.${part}` as ContentTextKey, values)}</BodyText>)}
      {id === "storage" && <>
        <Stack $gap="sm"><h3>{messages.text("privacy.storage.preferences.title")}</h3><BodyText>{messages.text("privacy.storage.preferences.body")}</BodyText></Stack>
        <Stack $gap="sm"><h3>{messages.text("privacy.storage.navigation.title")}</h3><BodyText>{messages.text("privacy.storage.navigation.body")}</BodyText>
          <BodyText>{messages.text("privacy.storage.navigation.retention", values)}</BodyText></Stack>
        <BodyText>{messages.text("privacy.storage.memory")}</BodyText>
      </>}
      {id === "release" && <ul>{privacyNotice.blockers.map((blocker) => <li key={blocker}><BodyText>{messages.text(`privacy.blocker.${blocker}`)}</BodyText></li>)}</ul>}
      {id === "choices" && <TextLink href={informationHref("contact", locale)} prefetch={false}>{messages.text("contact.link")}</TextLink>}
    </Stack>)}
    <TextLink href="/en/how-it-works" prefetch={false}>{messages.text("privacy.methodology")}</TextLink>
  </Stack>;
}
