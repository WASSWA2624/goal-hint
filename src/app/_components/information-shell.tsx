import "server-only";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import type { InformationPage } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

/** Interim, noindex surfaces; replaced by their dedicated 038–041 prompts. */
export function InformationShell({ locale, page }: { locale: string; page: InformationPage }) {
  const messages = createMessages(locale);
  return (
    <PublicShell locale={locale} current={page}>
      <Stack $gap="md">
        <PageHeading>{messages.text(`navigation.${page}`)}</PageHeading>
        <MutedText>{messages.text("interim.label")}</MutedText>
        <BodyText>{messages.text(`interim.${page}`)}</BodyText>
      </Stack>
    </PublicShell>
  );
}
