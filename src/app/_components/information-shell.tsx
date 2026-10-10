import "server-only";
import type { ReactNode } from "react";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import type { InformationPage } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

/** Shared information layout; unfinished pages retain their honest interim state. */
export function InformationShell({ locale, page, children }: { locale: string; page: InformationPage; children?: ReactNode }) {
  const messages = createMessages(locale);
  return (
    <PublicShell locale={locale} current={page}>
      <Stack $gap="md">
        <PageHeading>{messages.text(`navigation.${page}`)}</PageHeading>
        {children ?? <><MutedText>{messages.text("interim.label")}</MutedText>
          <BodyText>{messages.text(`interim.${page}`)}</BodyText></>}
      </Stack>
    </PublicShell>
  );
}
