import "server-only";

import { redirect } from "next/navigation";
import { BestSlips } from "@/components/slips/best-slips";
import { homeHref, matchesHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { gateBestSlips, readBestSlips } from "@/server/slips/best-slips";
import { pageMetadata } from "@/server/seo/metadata";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { homeStructuredData, serializeStructuredData } from "@/domain/discovery";
import { PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
export function createBestSlipsRoute({ read = readBestSlips, access = resolveViewerAccessFresh, policy = getDiscoveryPolicy } = {}) {
  return {
    async generateMetadata({ params }: Props) {
      const { locale } = await params, m = createMessages(locale);
      return pageMetadata({ title: m.text("bestSlips.metadataTitle"), description: m.text("bestSlips.description"), path: homeHref(locale), index: policy().index });
    },
    async Page({ params, searchParams }: Props) {
      const { locale } = await params, query = await searchParams;
      // Preserve bookmarks to the old homepage feed, including native search/filter forms.
      if (Object.keys(query).length) {
        const parameters = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) parameters.append(key, item);
        redirect(`${matchesHref(locale)}?${parameters}`);
      }
      const viewer = await access(), result = gateBestSlips(await read(viewer, locale), await access());
      return <PublicShell locale={locale} current="best-slips" app compact>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }} />
        <BestSlips result={result} locale={locale} signedIn={viewer.signedIn} />
      </PublicShell>;
    },
  };
}
