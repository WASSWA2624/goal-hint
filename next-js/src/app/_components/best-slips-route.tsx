import "server-only";

import { Suspense } from "react";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { BestSlipsLoading } from "@/components/slips/best-slips-loading";

import { BestSlips } from "@/components/slips/best-slips";
import { CriteriaPanel } from "@/components/slips/slip-styles";
import { TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { redirect } from "next/navigation";
import { BestSlipsQueryError, parseBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import type { ReportingDate } from "@/domain/calendar";
import { bestSlipsHref } from "@/domain/navigation";
import { emptySlipBrowsePage } from "@/domain/slip-browse-window";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { timedRequestPhase, withDocumentTiming } from "@/server/http/request-timing";
import { readBestSlipsBrowseSnapshot } from "@/server/slips/best-slips-browse";
import { gateBestSlips } from "@/server/slips/slip-preview";
import { bestSlipsMetadata } from "@/server/seo/metadata";
import { homeBrowseLinks } from "@/server/seo/home-query";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { getShellDate, PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
export function createBestSlipsRoute({ read = readBestSlipsBrowseSnapshot, access = resolveViewerAccessFresh, policy = getDiscoveryPolicy } = {}) {
  async function Content({ locale, query, today }: { locale: string; query: BestSlipsQuery; today: ReportingDate }) {
    const m = createMessages(locale);
    const result = await withDocumentTiming("best-slips-document", async () => {
      const published = await read(query, locale);
      if (published.state === "data-unavailable") return emptySlipBrowsePage(today, query, "data-unavailable");
      // Confirm access after the viewer-independent read before any selections enter the HTML.
      const viewer = await timedRequestPhase("access", access);
      return gateBestSlips(published, viewer);
    }, result => result.state === "data-unavailable").catch(() => emptySlipBrowsePage(today, query, "data-unavailable"));
    const browse = homeBrowseLinks(result, locale);
    return <>
      <Stack $gap="sm">
        <BestSlips result={result} locale={locale} signedIn={result.access?.signedIn ?? false} />
        {browse.length > 0 && <CriteriaPanel as="nav" aria-labelledby="browse-predictions"><Stack $gap="sm">
          <h2 id="browse-predictions">{m.text("bestSlips.browseTitle")}</h2>
          <Inline>{browse.map(([href, label]) => <TextLink key={href} href={href} prefetch={false}>{m.text(label)}</TextLink>)}</Inline>
        </Stack></CriteriaPanel>}
      </Stack>
    </>;
  }
  return {
    async generateMetadata({ params, searchParams }: Props) {
      const [{ locale }, query] = await Promise.all([params, searchParams]);
      return bestSlipsMetadata(locale, query, policy);
    },
    async Page({ params, searchParams }: Props) {
      const [{ locale }, values, today] = await Promise.all([params, searchParams, getShellDate()]);
      let query: BestSlipsQuery;
      try { query = parseBestSlipsQuery(values, today); }
      catch (error) {
        if (error instanceof BestSlipsQueryError) redirect(bestSlipsHref(locale));
        throw error;
      }
      return <PublicShell locale={locale} today={today} current="best-slips" app compact>
        <VisuallyHidden as="h1">{createMessages(locale).text("bestSlips.title")}</VisuallyHidden>
        <Suspense fallback={<BestSlipsLoading locale={locale} today={today} query={query} heading={false} />}>
          <ServerThemeUntilHydrated><Content locale={locale} query={query} today={today} /></ServerThemeUntilHydrated>
        </Suspense>
      </PublicShell>;
    },
  };
}
