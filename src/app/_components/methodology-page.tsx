import "server-only";

import { BodyText, PageHeading, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import type { PerformancePageResult } from "@/server/performance/performance-page";
import { MethodologyContent } from "./methodology-content";
import { PerformanceReport } from "./performance-report";
import { PublicShell } from "./public-shell";

export function MethodologyPage({ result, locale, today }: { result: PerformancePageResult; locale: string; today: ReportingDate }) {
  const messages = createMessages(locale);
  return <PublicShell locale={locale} today={today} current="how-it-works"><Stack $gap="xl">
    <Stack $gap="md"><PageHeading>{messages.text("navigation.how-it-works")}</PageHeading><BodyText>{messages.text("methodology.intro")}</BodyText></Stack>
    <MethodologyContent locale={locale} />
    <PerformanceReport result={result} locale={locale} />
  </Stack></PublicShell>;
}
