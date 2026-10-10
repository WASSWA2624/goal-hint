import "server-only";
import type { Metadata } from "next";
import { canonicalUrl, feedDiscovery, type DiscoveryPolicy } from "../../domain/discovery.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { ReportingDate } from "../../domain/calendar.ts";
import type { FeedQuery } from "../../domain/feed-query.ts";
import { privacyNotice } from "../../domain/privacy-notice.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import { contactNotice } from "../../domain/contact-notice.ts";
import { createMessages } from "../../i18n/messages.ts";
import type { InformationPage } from "../../domain/navigation.ts";
import type { FeedPageResult } from "../matches/feed-page.ts";
import { getDiscoveryPolicy } from "./policy.ts";

const image = { url: canonicalUrl("/brand/goal-hint-open-graph.png"), width: 1200, height: 630,
  alt: createMessages().text("metadata.socialAlt") };
export function pageMetadata({ title, description, path, index = false }: {
  title: string; description: string; path?: string; index?: boolean;
}): Metadata {
  const url = path ? canonicalUrl(path) : undefined;
  return { title, description, ...(url ? { alternates: { canonical: url } } : {}), robots: { index, follow: true },
    openGraph: { type: "website", siteName: publicPolicy.name, title, description, ...(url ? { url } : {}), locale: "en", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] } };
}

export function feedMetadata(query: FeedQuery, today: ReportingDate, result: FeedPageResult, policy: DiscoveryPolicy = getDiscoveryPolicy()): Metadata {
  const messages = createMessages(query.locale), discovery = feedDiscovery(query, today);
  const values = { date: messages.reportingDate(discovery.range.startDate), page: messages.number(query.page) };
  const title = discovery.home ? messages.text("metadata.homeTitle") : messages.text("metadata.archiveTitle", values);
  const pageTitle = query.page === 1 ? title : messages.text("metadata.paginationTitle", { title: title.replace(/ \| Goal Hint$/u, ""), page: values.page });
  const populated = result.data !== null && result.data.records.length > 0 && result.data.state !== "page-out-of-range";
  return pageMetadata({ title: pageTitle, description: discovery.home ? messages.text("metadata.description")
    : messages.text("metadata.archiveDescription", values), path: discovery.path, index: policy.index && discovery.eligible && populated });
}

export function createInformationMetadata(page: InformationPage, policy = getDiscoveryPolicy) {
  return async ({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}): Promise<Metadata> => {
    const messages = createMessages(), prefix = page === "how-it-works" ? "methodology" : page;
    return pageMetadata({ title: messages.text(`${prefix}.metadataTitle`), description: messages.text(`${prefix}.description`),
      path: `/en/${page}`, index: policy().index && informationPublicationReady(page) && Object.keys(await searchParams ?? {}).length === 0 });
  };
}

export function informationPublicationReady(page: InformationPage): boolean {
  return page === "privacy" ? privacyNotice.releaseReady : page === "terms" ? termsNotice.releaseReady
    : page === "contact" ? contactNotice.releaseReady : true;
}
