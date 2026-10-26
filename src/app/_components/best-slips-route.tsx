import "server-only";

import { BestSlips } from "@/components/slips/best-slips";
import { CriteriaPanel } from "@/components/slips/slip-styles";
import { TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { addReportingDays } from "@/domain/calendar";
import { feedDefaults, feedHref, informationHref, performanceHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { gateBestSlips, readBestSlips } from "@/server/slips/best-slips";
import { bestSlipsMetadata } from "@/server/seo/metadata";
import { redirectLegacyFeedQuery } from "@/server/seo/home-query";
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
      const viewer = await access(), result = gateBestSlips(await read(viewer, locale), await access());
      // Without slips the home page is nearly empty; plain links keep the nearby dated archives, help and results one step away.
      const day = (offset: number) => feedHref({ date: addReportingDays(result.day, offset), status: feedDefaults.today.status }, locale);
      const browse = [[day(0), m.text("feed.date.today")], [day(1), m.text("feed.date.tomorrow")], [day(-1), m.text("feed.date.yesterday")],
        [informationHref("help", locale), m.text("navigation.help")], [performanceHref(locale), m.text("performance.title")]] as const;
      return <PublicShell locale={locale} current="best-slips" app compact>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }} />
        <Stack $gap="sm">
          <BestSlips result={result} locale={locale} signedIn={viewer.signedIn} />
          {result.slips.length === 0 && <CriteriaPanel as="nav" aria-labelledby="browse-predictions"><Stack $gap="sm">
            <h2 id="browse-predictions">{m.text("bestSlips.browseTitle")}</h2>
            <Inline>{browse.map(([href, label]) => <TextLink key={href} href={href} prefetch={false}>{label}</TextLink>)}</Inline>
          </Stack></CriteriaPanel>}
        </Stack>
      </PublicShell>;
    },
  };
}
