import "server-only";

import { Suspense } from "react";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { BestSlipsLoading } from "@/components/slips/best-slips-loading";

import { BestSlips } from "@/components/slips/best-slips";
import { CriteriaPanel } from "@/components/slips/slip-styles";
import { TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { readBestSlipsBrowseSnapshot } from "@/server/slips/best-slips-browse";
import { gateBestSlips } from "@/server/slips/slip-preview";
import { bestSlipsMetadata } from "@/server/seo/metadata";
import { homeBrowseLinks } from "@/server/seo/home-query";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { getShellDate, PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
export function createBestSlipsRoute({ read = readBestSlipsBrowseSnapshot, access = resolveViewerAccessFresh, policy = getDiscoveryPolicy } = {}) {
  async function Content({ locale }: { locale: string }) {
    const m = createMessages(locale);
    const published = await read(defaultBestSlipsQuery(), locale);
    // The stored cohort is viewer-independent. A fresh access check after the
    // read covers an entitlement change before any selections enter the HTML.
    const viewer = await access();
    const result = gateBestSlips(published, viewer);
    const browse = homeBrowseLinks(result, locale);
    return <>
      <Stack $gap="sm">
        <BestSlips result={result} locale={locale} signedIn={viewer.signedIn} />
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
    async Page({ params }: Props) {
      const { locale } = await params;
      const today = await getShellDate();
      return <PublicShell locale={locale} today={today} current="best-slips" app compact>
        <Suspense fallback={<BestSlipsLoading locale={locale} today={today} />}>
          <ServerThemeUntilHydrated><Content locale={locale} /></ServerThemeUntilHydrated>
        </Suspense>
      </PublicShell>;
    },
  };
}
