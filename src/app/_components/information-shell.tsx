import "server-only";
import type { ReactNode } from "react";
import { PageHeading, Stack } from "@/components/ui/layout";
import type { InformationPage } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { PublicShell } from "./public-shell";

/** Shared information layout: the page heading above each page's own content. */
export function InformationShell({ locale, page, children }: { locale: string; page: InformationPage; children: ReactNode }) {
  const messages = createMessages(locale);
  return (
    <PublicShell locale={locale} current={page}>
      <Stack $gap="md">
        <PageHeading>{messages.text(`navigation.${page}`)}</PageHeading>
        {children}
      </Stack>
    </PublicShell>
  );
}
