import "server-only";

import { notFound } from "next/navigation";
import { BestSlipCard } from "@/components/slips/best-slip-card";
import { TextLink } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { bestSlipsQueryRules } from "@/domain/best-slips-query";
import { bestSlipsRules } from "@/domain/best-slips";
import { parseReportingDate } from "@/domain/calendar";
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
    if (!/^[1-9]\d{0,2}$/u.test(rank) || Number(rank) > bestSlipsRules.count) notFound();
    const query = { period: "custom", from: date, to: date, status: "all", page: Math.ceil(Number(rank) / bestSlipsQueryRules.pageSize) } as const;
    const initial = await access();
    let result = await read(initial, query, locale), viewer = await access();
    if (initial.tier !== viewer.tier) { result = await read(viewer, query, locale); viewer = await access(); }
    const view = gateBestSlips(result, viewer).slips.find((slip) => slip.rank === Number(rank));
    if (!view) notFound();
    return <PublicShell locale={locale} current="best-slips" app compact><Stack $gap="md">
      <BestSlipCard view={view} day={day} locale={locale} signedIn={viewer.signedIn} />
      <TextLink href={`/${locale}`} prefetch={false}>{createMessages(locale).text("bestSlips.title")}</TextLink>
    </Stack></PublicShell>;
  };
}
