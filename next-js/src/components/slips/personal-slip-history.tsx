"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getMemberSessionSnapshot, getServerMemberSessionSnapshot, subscribeMemberSession } from "@/components/members/member-session";
import { Button } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import type { ReportingDate } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import { BestSlips } from "./best-slips";
import { Note } from "./slip-styles";

export function PersonalSlipHistory({ locale, today }: { locale: string; today: ReportingDate }) {
  const member = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  return member ? <AccountHistory key={`${member}:${today}`} locale={locale} /> : null;
}
function AccountHistory({ locale }: { locale: string }) {
  const [result, setResult] = useState<SlipsBrowseResult | null>(null), [failed, setFailed] = useState(false), [attempt, retry] = useState(0);
  const m = createMessages(locale);
  useEffect(() => {
    const controller = new AbortController(), deadline = setTimeout(() => { setFailed(true); controller.abort(); }, 30_000);
    void fetch("/api/slips/history", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const data: SlipsBrowseResult = await response.json();
        if (!data.browse || !data.access?.signedIn || !Array.isArray(data.slips)) throw new Error("invalid");
        if (!controller.signal.aborted) setResult(data);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => clearTimeout(deadline));
    return () => { clearTimeout(deadline); controller.abort(); };
  }, [attempt]);
  return result ? <BestSlips result={result} locale={locale} signedIn source="saved" /> : <Stack $gap="sm" aria-live="polite">
    <h2>{m.text("history.savedTitle")}</h2><Note>{m.text(failed ? "bestSlips.filters.dataUnavailable" : "history.loading")}</Note>
    {failed && <Button variant="secondary" onClick={() => { setFailed(false); retry((value) => value + 1); }}>{m.text("feed.retry")}</Button>}
  </Stack>;
}
