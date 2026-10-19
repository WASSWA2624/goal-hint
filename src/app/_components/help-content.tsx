import "server-only";

import { ButtonLink, TextLink } from "@/components/ui/controls";
import { BodyText, Inline, SectionHeading, Stack } from "@/components/ui/layout";
import { homeHref, informationHref } from "@/domain/navigation";
import { createContentMessages, type ContentTextKey } from "@/i18n/content-messages";
import { ContentsNav, HelpGrid, HelpList, HelpSection } from "./information-styles";

const topics = [
  { id: "access", items: ["trial", "payment", "code"] },
  { id: "dates", items: ["date", "search", "time"] },
  { id: "filters", items: ["open", "probability", "reset"] },
  { id: "browsing", items: ["sort", "tabs", "more"] },
  { id: "cards", items: ["fixture", "prediction", "analysis"] },
  { id: "predictions", items: ["estimates", "markets"] },
  { id: "updates", items: ["daily", "lock"] },
  { id: "results", items: ["pending", "settled", "corrections"] },
] as const;

export function HelpContent({ locale }: { locale: string }) {
  const messages = createContentMessages(locale);
  return <Stack $gap="md">
    <BodyText>{messages.text("help.intro")}</BodyText>
    <Inline><ButtonLink href={homeHref(locale)} prefetch={false}>{messages.text("help.browse")}</ButtonLink></Inline>
    <ContentsNav aria-label={messages.text("help.contents")}>
      {topics.map(({ id }) => <TextLink key={id} href={`#${id}`} prefetch={false}>{messages.text(`help.${id}.title`)}</TextLink>)}
    </ContentsNav>
    <HelpGrid>{topics.map(({ id, items }) => <HelpSection key={id} id={id} aria-labelledby={`help-${id}-heading`}>
      <SectionHeading id={`help-${id}-heading`}>{messages.text(`help.${id}.title`)}</SectionHeading>
      <HelpList>{items.map((item) => <div key={item}>
        <dt>{messages.text(`help.${id}.${item}.title` as ContentTextKey)}</dt>
        <dd>{messages.text(`help.${id}.${item}.body` as ContentTextKey)}</dd>
      </div>)}</HelpList>
      {id === "results" && <TextLink href={informationHref("contact", locale)} prefetch={false}>{messages.text("help.contact")}</TextLink>}
    </HelpSection>)}</HelpGrid>
  </Stack>;
}
