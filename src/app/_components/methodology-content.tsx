import "server-only";

import { TextLink } from "@/components/ui/controls";
import { BodyText, SectionHeading, Stack } from "@/components/ui/layout";
import { informationHref } from "@/domain/navigation";
import { createContentMessages } from "@/i18n/content-messages";
import { ContentsNav, OutcomeDefinitions } from "./information-styles";

export function MethodologyContent({ locale }: { locale: string }) {
  const messages = createContentMessages(locale);
  const sections = ["probabilities", "evidence", "schedule", "settlement", "corrections"] as const;
  return <>
    <ContentsNav aria-label={messages.text("methodology.contents")}>
      {sections.map((id) => <TextLink key={id} href={`#${id}`} prefetch={false}>{messages.text(`methodology.${id}.title`)}</TextLink>)}
      <TextLink href="#performance" prefetch={false}>{messages.text("performance.title")}</TextLink>
    </ContentsNav>
    {sections.map((id) => <Stack as="section" key={id} id={id} aria-labelledby={`${id}-heading`} $gap="md">
      <SectionHeading id={`${id}-heading`}>{messages.text(`methodology.${id}.title`)}</SectionHeading>
      <BodyText>{messages.text(`methodology.${id}.body`)}</BodyText>
      {id === "probabilities" && <BodyText>{messages.text("methodology.probabilities.limits")}</BodyText>}
      {id === "evidence" && <><BodyText>{messages.text("methodology.evidence.limits")}</BodyText>
        <BodyText>{messages.text("methodology.evidence.attribution")}</BodyText>
        <TextLink href="https://www.api-football.com/" prefetch={false}>{messages.text("methodology.evidence.provider")}</TextLink></>}
      {id === "schedule" && <>{(["retention", "cutoff", "scores"] as const).map((part) =>
        <BodyText key={part}>{messages.text(`methodology.schedule.${part}`)}</BodyText>)}</>}
      {id === "settlement" && <><OutcomeDefinitions>
        {(["correct", "incorrect", "pending", "void", "unavailable"] as const).map((outcome) =>
          <div key={outcome}><dt><strong>{messages.text(`outcome.${outcome}`)}</strong></dt><BodyText as="dd">{messages.text(`methodology.outcome.${outcome}`)}</BodyText></div>)}
      </OutcomeDefinitions><BodyText>{messages.text("methodology.settlement.history")}</BodyText></>}
      {id === "corrections" && <><BodyText data-correction-policy="unresolved">{messages.text("methodology.corrections.pending")}</BodyText>
        <TextLink href={informationHref("contact", locale)} prefetch={false}>{messages.text("contact.link")}</TextLink></>}
    </Stack>)}
  </>;
}
