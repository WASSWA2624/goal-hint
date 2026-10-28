import "server-only";

import { BestSlips } from "@/components/slips/best-slips";
import { CriteriaPanel } from "@/components/slips/slip-styles";
import { TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { gateBestSlips, readBestSlips } from "@/server/slips/best-slips";
import { bestSlipsMetadata } from "@/server/seo/metadata";
import { homeBrowseLinks, redirectLegacyFeedQuery } from "@/server/seo/home-query";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { homeStructuredData, serializeStructuredData } from "@/domain/discovery";
import { PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
export function createBestSlipsRoute({ read = readBestSlips, access = resolveViewerAccessFresh, policy = getDiscoveryPolicy } = {}) {
  return {
    async generateMetadata({ params, searchParams }: Props) {
      const [{ locale }, query] = await Promise.all([params, searchParams]);
      return bestSlipsMetadata(locale, query, policy);
    },
    async Page({ params, searchParams }: Props) {
      const { locale } = await params, m = createMessages(locale);
      redirectLegacyFeedQuery(locale, await searchParams);
      const initialViewer = await access(), published = await read(initialViewer, locale);
      const viewer = await access(), result = gateBestSlips(published, viewer);
      const browse = homeBrowseLinks(result, locale);
      return <PublicShell locale={locale} current="best-slips" app compact>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }} />
        <Stack $gap="sm">
          <BestSlips result={result} locale={locale} signedIn={viewer.signedIn} />
          {browse.length > 0 && <CriteriaPanel as="nav" aria-labelledby="browse-predictions"><Stack $gap="sm">
            <h2 id="browse-predictions">{m.text("bestSlips.browseTitle")}</h2>
            <Inline>{browse.map(([href, label]) => <TextLink key={href} href={href} prefetch={false}>{m.text(label)}</TextLink>)}</Inline>
          </Stack></CriteriaPanel>}
        </Stack>
      </PublicShell>;
    },
  };
}
