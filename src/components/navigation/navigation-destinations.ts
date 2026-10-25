import type { ReportingDate } from "../../domain/calendar.ts";
import { deviceFeedEntryHref } from "../../domain/device-feed.ts";
import { adminLandingPath } from "../../domain/admin-navigation.ts";
import { feedHref, getFeedEntry, homeHref, informationHref, informationPages, matchesHref, performanceHref, slipsHref } from "../../domain/navigation.ts";
import { createMessages } from "../../i18n/messages.ts";
import type { NavigationDestination } from "./responsive-navigation";

/** Public and owner headers use the same destinations, labels and browsing-date rules. */
export function navigationDestinations(today: ReportingDate, locale: string, zone?: string | null): readonly NavigationDestination[] {
  const messages = createMessages(locale);
  return [
    { key: "best-slips", href: homeHref(locale), label: messages.text("bestSlips.title"), tab: messages.text("bestSlips.title"), icon: "slips", tone: "teal" },
    { key: "today", href: zone ? deviceFeedEntryHref("today", today, zone, locale) : matchesHref(locale), label: messages.text("navigation.matches"), tab: messages.text("navigation.matches"), icon: "matches", tone: "teal" },
    { key: "live", href: zone ? deviceFeedEntryHref("live", today, zone, locale) : `${matchesHref(locale)}?status=live`, label: messages.text("navigation.live"), tab: messages.text("navigation.live"), icon: "live", tone: "red" },
    { key: "results", href: zone ? deviceFeedEntryHref("results", today, zone, locale) : feedHref(getFeedEntry(today, "results"), locale), label: messages.text("navigation.results"), tab: messages.text("navigation.results"), icon: "results", tone: "violet" },
    { key: "slips", href: slipsHref(locale), label: messages.text("navigation.slips"), tab: messages.text("navigation.slips"), icon: "slips", tone: "teal" },
    { key: "performance", href: performanceHref(locale), label: messages.text("performance.title"), tab: messages.text("performance.title"), icon: "results", tone: "violet" },
    ...informationPages.map(page => ({ key: page, href: informationHref(page, locale), label: messages.text(`navigation.${page}`), tab: messages.text(`navigation.${page}`), icon: page, tone: "blue" as const })),
  ];
}

export function dashboardDestination(label: string): NavigationDestination {
  return { key: "dashboard", href: adminLandingPath, label, tab: label, icon: "dashboard", tone: "blue" };
}
