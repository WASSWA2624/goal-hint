"use client";

import styled from "styled-components";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { BestSlipsQuery } from "@/domain/best-slips-query";
import type { ReportingDate } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import { BestSlipsFilters } from "./best-slips-filters";
import { SlipStack } from "./slip-styles";
import { LoadingTheme } from "@/styles/loading-theme";

const ignoreChange = () => {};
const LoadingStack = styled(SlipStack)`
  [data-header-brand] { content: var(--gh-loading-header-brand-image); }
`;

/** Keep the homepage's real controls and period visible while its authorized stored read streams. */
export function BestSlipsLoading({ locale, today, query, heading = true }: {
  locale: string; today: ReportingDate; query: BestSlipsQuery; heading?: boolean;
}) {
  const messages = createMessages(locale);
  return <LoadingTheme><LoadingStack data-best-slips-loading>
    <AppBrandBar locale={locale} />
    {heading && <VisuallyHidden as="h1">{messages.text("bestSlips.title")}</VisuallyHidden>}
    <div inert aria-busy="true"><BestSlipsFilters query={query} today={today} locale={locale} busy
      statistics={null} onChange={ignoreChange} /></div>
  </LoadingStack></LoadingTheme>;
}
