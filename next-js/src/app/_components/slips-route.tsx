import "server-only";

import { Suspense, type ComponentProps } from "react";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { validTimeZone } from "@/domain/device-calendar";
import { isSlipMarketFamily, isSlipMarketSelection, slipMarketFamilies, slipMarketOutcomeMaximumLength, slipMarketSelections,
  type SlipMarketFamily, type SlipMarketSelection } from "@/domain/slip-markets";
import { slipsHref } from "@/domain/navigation";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipInputFields, type SlipInputs } from "@/domain/slip-builder";
import { SlipBuilder, SlipBuilderChrome, SlipBuilderLoading, type SlipCriteriaIssue } from "@/components/slips/slip-builder";
import { SlipStack } from "@/components/slips/slip-styles";
import { createMessages } from "@/i18n/messages";
import { approvedSlipJointModel, boundJointSlipModel } from "@/server/slips/joint-model";
import { readPublicSlipBuild } from "@/server/slips/public-slips";
import { contentAccess, type AccessResolver } from "@/server/members/gated-reads";
import { resolveViewerAccess, resolveViewerAccessFresh } from "@/server/members/viewer-access";
import { publicOddsEnabled } from "@/server/odds/public-odds-policy";
import { pageMetadata } from "@/server/seo/metadata";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { getShellInstant, PublicShell } from "./public-shell";
import { slipConfigurationIdSchema } from "@/domain/slip-configurations";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
type BuilderDraft = Omit<ComponentProps<typeof SlipBuilder>, "result" | "entryState" | "premiumOnly" | "signedIn">;
const accessDeadlineMs = 8_000;

async function boundedAccess(resolve: AccessResolver, deadlineMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((finish) => { timer = setTimeout(() => finish(null), deadlineMs); });
  try { return await Promise.race([contentAccess(resolve).catch(() => null), deadline]); }
  finally { clearTimeout(timer); }
}

/** Entitled, read-only GET builds. Invalid drafts remain editable without reading the stored feed.
 * `jointModel` only decides whether whole-slip limits are offered; the reader applies its own bound model. */
export function createSlipsRoute({ read = readPublicSlipBuild, instant = getShellInstant,
  completionInstant = () => utcInstantFromEpochMilliseconds(Date.now()), resolveAccess = resolveViewerAccess,
  jointModel = boundJointSlipModel, viewerDeadlineMs = accessDeadlineMs } = {}) {
  const recheckAccess = resolveAccess === resolveViewerAccess ? resolveViewerAccessFresh : resolveAccess;
  async function Content({ draft, at, build }: { draft: BuilderDraft; at: Awaited<ReturnType<typeof getShellInstant>>; build: boolean }) {
    let access = await boundedAccess(resolveAccess, viewerDeadlineMs);
    let result: Awaited<ReturnType<typeof read>> | null = null;
    if (access?.tier === "full" && build) {
      let captured = false;
      const clock = { now: () => { if (!captured) { captured = true; return at; } return completionInstant(); } };
      result = await read(draft.criteria, clock, draft.locale).catch(() => ({ state: "data-unavailable" as const, data: null,
        asOf: at, examined: 0, searchLimited: false, partialCoverage: false, retryAfterSeconds: null }));
      // A build can outlive access. No selections enter the page or the Flight payload until this check completes.
      access = await boundedAccess(recheckAccess, viewerDeadlineMs);
    }
    return <SlipBuilder {...draft} hideChrome result={access?.tier === "full" ? result : null}
      entryState={access ? "ready" : "access-unavailable"} premiumOnly={access?.tier === "free"} signedIn={access?.signedIn ?? false} />;
  }
  return {
    async generateMetadata({ params }: Props) {
      const { locale } = await params, messages = createMessages(locale);
      return pageMetadata({ title: messages.text("slips.metadataTitle"), description: messages.text("slips.description"), path: slipsHref(locale) });
    },
    async Page({ params, searchParams }: Props) {
      const [{ locale }, rawQuery, at] = await Promise.all([params, searchParams, instant()]);
      const today = getReportingDate(at);
      const { configuration, ...query } = rawQuery;
      const configurationId = slipConfigurationIdSchema.safeParse(configuration).success ? configuration as string : null;
      const initialInputs: SlipInputs = {};
      for (const field of slipInputFields) {
        const value = query[field];
        if (typeof value === "string" && value.length <= 256) initialInputs[field] = value;
      }
      let criteria = defaultSlipCriteria(today), error: SlipCriteriaIssue | null = null;
      let initialTimeZone: string | undefined;
      try {
        if (configuration !== undefined && configuration !== "" && !configurationId) throw new SlipCriteriaError("query", "invalid-query");
        criteria = parseSlipCriteria(query, today);
      }
      catch (issue) {
        if (!(issue instanceof SlipCriteriaError)) throw issue;
        error = { code: issue.code, field: issue.field };
        const { start, end, tz } = query;
        if (start !== undefined || end !== undefined || tz !== undefined) {
          if (validTimeZone(tz)) initialTimeZone = tz;
          for (const [endpoint, value] of [["From", start], ["To", end]] as const) {
            delete initialInputs[`date${endpoint}`]; delete initialInputs[`time${endpoint}`];
            if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
              initialInputs[`date${endpoint}`] = value.slice(0, 10); initialInputs[`time${endpoint}`] = value.slice(11);
            }
          }
          try { criteria = parseSlipCriteria({ start, end, tz }, today); }
          catch (calendarIssue) { if (!(calendarIssue instanceof SlipCriteriaError)) throw calendarIssue; }
        }
      }
      const rawMarkets = query.markets;
      const marketValues = Array.isArray(rawMarkets) ? rawMarkets : [rawMarkets ?? ""];
      const initialMarkets = rawMarkets === undefined && query.build !== "1" ? undefined
        : marketValues.length <= slipMarketFamilies.length && marketValues.every((value) => value.length <= 256)
          ? marketValues.flatMap((value) => value.split(",")).filter(isSlipMarketFamily) : [];
      const initialOutcomes: Partial<Record<SlipMarketFamily, readonly SlipMarketSelection[]>> = {};
      for (const family of slipMarketFamilies) {
        const raw = query[`picks.${family}`], values = Array.isArray(raw) ? raw : [raw ?? "auto"];
        if (values.length > slipMarketSelections[family].length || values.some((value) => value.length > slipMarketOutcomeMaximumLength(family))) continue;
        const choices = values.flatMap((value) => value.split(",")).filter((value): value is SlipMarketSelection => isSlipMarketSelection(family, value));
        if (choices.length) initialOutcomes[family] = choices;
      }
      const initialReuse = query.reuse === "0" ? false : query.reuse === "1"
        || Array.isArray(query.reuse) && query.reuse.length === 2 && query.reuse[0] === "0" && query.reuse[1] === "1" ? true : criteria.reuse;
      let jointEstimates = false;
      try { const binding = jointModel(); jointEstimates = !!binding && approvedSlipJointModel(binding, at); }
      catch { /* An unavailable estimator offers no whole-slip limits. */ }
      // A criteria change or browser history navigation resets uncontrolled inputs to this server-owned draft.
      const key = `${Object.keys(query).length ? "draft" : "defaults"}|${serializeSlipCriteria(criteria)}|${JSON.stringify(initialInputs)}|${initialTimeZone ?? ""}|${initialMarkets?.join(",") ?? ""}|${JSON.stringify(initialOutcomes)}|${initialReuse}|${error?.code ?? ""}|${jointEstimates}|${configurationId ?? ""}`;
      const draft: BuilderDraft = { locale, today, criteria, providerOdds: publicOddsEnabled(), error, initialInputs,
        ...(initialTimeZone ? { initialTimeZone } : {}), initialOutcomes, initialReuse, jointEstimates, configurationId,
        applyDefault: Object.keys(rawQuery).length === 0, ...(initialMarkets ? { initialMarkets } : {}) };
      return <PublicShell showAccount locale={locale} today={today} current="slips" app compact>
        <SlipStack $builderFrame>
          <SlipBuilderChrome locale={locale} showAccount />
          <Suspense fallback={<SlipBuilderLoading locale={locale} criteria={criteria} jointEstimates={jointEstimates} />}>
            <ServerThemeUntilHydrated><Content key={key} draft={draft} at={at} build={!error && query.build === "1"} /></ServerThemeUntilHydrated>
          </Suspense>
        </SlipStack>
      </PublicShell>;
    },
  };
}
