import "server-only";

import { notFound } from "next/navigation";
import { BestSlipCard } from "@/components/slips/best-slip-card";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { bestSlipsQueryRules } from "@/domain/best-slips-query";
import { parseBestSlipPublicRank } from "@/domain/best-slip-odds-bands";
import { parseReportingDate } from "@/domain/calendar";
import { bestSlipsHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { gateBestSlips, readPublicBestSlipDay } from "@/server/slips/best-slips";
import { PublicShell } from "./public-shell";

/** The public link rechecks current access and original-cycle completion on every read. */
export function createPublicBestSlipRoute({ read = readPublicBestSlipDay, access = resolveViewerAccessFresh } = {}) {
  return async function PublicBestSlip({ params }: { params: Promise<{ locale: string; day: string; rank: string }> }) {
    const { locale, day, rank } = await params;
    let date;
    try { date = parseReportingDate(day); } catch { notFound(); }
    const publicRank = parseBestSlipPublicRank(rank);
    if (publicRank === null) notFound();
    const query = { period: "custom", from: date, to: date, status: "all", rank: publicRank, page: Math.ceil(publicRank / bestSlipsQueryRules.pageSize) } as const;
    const initial = await access();
    let result = await read(initial, query, locale), viewer = await access();
    if (initial.tier !== viewer.tier) { result = await read(viewer, query, locale); viewer = await access(); }
    const view = gateBestSlips(result, viewer).slips.find((slip) => slip.rank === publicRank);
    if (!view) notFound();
    return <PublicShell locale={locale} current="best-slips" app compact><Stack $gap="md">
      <BestSlipCard view={view} day={day} locale={locale} signedIn={viewer.signedIn} />
      <TextLink href={bestSlipsHref(locale)} contextBack prefetch={false}>{createMessages(locale).text("navigation.back")}</TextLink>
    </Stack></PublicShell>;
  };
}
