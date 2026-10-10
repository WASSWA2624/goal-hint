import "server-only";

import { TextLink } from "@/components/ui/controls";
import { BodyText, Inline, SectionHeading, Stack } from "@/components/ui/layout";
import { restorationRules } from "@/domain/feed-navigation";
import { privacyNotice } from "@/domain/privacy-notice";
import { createMessages, type TextKey } from "@/i18n/messages";
import { publicCacheRules } from "@/server/cache/public-cache";
import { InformationNotice } from "./information-notice";

const sections = ["access", "requests", "search", "storage", "tracking", "images", "football", "retention", "choices", "release"] as const;

export function PrivacyContent({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  const values = { entries: messages.number(restorationRules.maximumEntries), minutes: messages.number(restorationRules.maximumAgeMilliseconds / 60_000),
    seconds: messages.number(publicCacheRules.mutableMs / 1000), hours: messages.number(publicCacheRules.immutableMs / 3_600_000) };
  const paragraphs = { access: ["body"], requests: ["body", "logs"], search: ["body", "counter", "refresh"], storage: [],
    tracking: ["body", "scope"], images: ["body", "recipients"], football: ["body", "permissions"], retention: ["body", "expiry"],
    choices: ["body", "contact"], release: ["body"] } as const;
  return <Stack $gap="xl" data-privacy-status={privacyNotice.publication} data-privacy-release-ready={privacyNotice.releaseReady}>
    <InformationNotice locale={locale} kind="privacy" reviewedOn={privacyNotice.reviewedOn} />
    <nav aria-label={messages.text("privacy.contents")}><Inline>
      {sections.map((id) => <TextLink key={id} href={`#privacy-${id}`} prefetch={false}>{messages.text(`privacy.${id}.title`)}</TextLink>)}
    </Inline></nav>
    {sections.map((id) => <Stack as="section" id={`privacy-${id}`} key={id} aria-labelledby={`privacy-${id}-heading`} $gap="md">
      <SectionHeading id={`privacy-${id}-heading`}>{messages.text(`privacy.${id}.title`)}</SectionHeading>
      {paragraphs[id].map((part) => <BodyText key={part}>{messages.text(`privacy.${id}.${part}` as TextKey, values)}</BodyText>)}
      {id === "storage" && <>
        <h3>{messages.text("privacy.storage.preferences.title")}</h3><BodyText>{messages.text("privacy.storage.preferences.body")}</BodyText>
        <h3>{messages.text("privacy.storage.navigation.title")}</h3><BodyText>{messages.text("privacy.storage.navigation.body")}</BodyText>
        <BodyText>{messages.text("privacy.storage.navigation.retention", values)}</BodyText><BodyText>{messages.text("privacy.storage.memory")}</BodyText>
      </>}
      {id === "release" && <ul>{privacyNotice.blockers.map((blocker) => <li key={blocker}><BodyText>{messages.text(`privacy.blocker.${blocker}`)}</BodyText></li>)}</ul>}
    </Stack>)}
    <TextLink href="/en/how-it-works" prefetch={false}>{messages.text("privacy.methodology")}</TextLink>
  </Stack>;
}
