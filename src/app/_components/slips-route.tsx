import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { qualifiedJointModel } from "@/domain/joint-slips";
import { isMarketFamily, isMarketSelection, type MarketFamily, type MarketSelection } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { slipsHref } from "@/domain/navigation";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipInputFields, type SlipInputs } from "@/domain/slip-builder";
import { SlipBuilder, type SlipCriteriaIssue } from "@/components/slips/slip-builder";
import { createMessages } from "@/i18n/messages";
import { boundJointSlipModel } from "@/server/slips/joint-model";
import { readPublicSlipBuild } from "@/server/slips/public-slips";
import { readCompletedSlips } from "@/server/slips/saved-slips";
import { SlipHistory } from "@/components/slips/slip-history";
import { createGatedReads, contentAccess } from "@/server/members/gated-reads";
import { resolveViewerAccess } from "@/server/members/viewer-access";
import { pageMetadata } from "@/server/seo/metadata";
import { getShellInstant, PublicShell } from "./public-shell";

type Props = Readonly<{ params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

/** Anonymous, read-only GET builds. Invalid drafts remain editable without reading the stored feed.
 * `jointModel` only decides whether whole-slip limits are offered; the reader applies its own bound model. */
export function createSlipsRoute({ read = readPublicSlipBuild, instant = getShellInstant,
  completionInstant = () => utcInstantFromEpochMilliseconds(Date.now()), resolveAccess = resolveViewerAccess, history = readCompletedSlips,
  jointModel = boundJointSlipModel } = {}) {
  return {
    async generateMetadata({ params }: Props) {
      const { locale } = await params, messages = createMessages(locale);
      return pageMetadata({ title: messages.text("slips.metadataTitle"), description: messages.text("slips.description"), path: slipsHref(locale) });
    },
    async Page({ params, searchParams }: Props) {
      const { locale } = await params, query = await searchParams, at = await instant(), today = getReportingDate(at);
      const access = await contentAccess(resolveAccess), showAccount = true;
      const initialInputs: SlipInputs = {};
      for (const field of slipInputFields) {
        const value = query[field];
        if (typeof value === "string" && value.length <= 256) initialInputs[field] = value;
      }
      let criteria = defaultSlipCriteria(today), error: SlipCriteriaIssue | null = null;
      try { criteria = parseSlipCriteria(query, today); }
      catch (issue) {
        if (!(issue instanceof SlipCriteriaError)) throw issue;
        error = { code: issue.code, field: issue.field };
      }
      const rawMarkets = query.markets;
      const marketValues = Array.isArray(rawMarkets) ? rawMarkets : [rawMarkets ?? ""];
      const initialMarkets = rawMarkets === undefined && query.build !== "1" ? undefined
        : marketValues.length <= 4 && marketValues.every((value) => value.length <= 256)
          ? marketValues.flatMap((value) => value.split(",")).filter(isMarketFamily) : [];
      const initialOutcomes: Partial<Record<MarketFamily, readonly MarketSelection[]>> = {};
      for (const family of publicPolicy.markets) {
        const raw = query[`picks.${family}`], values = Array.isArray(raw) ? raw : [raw ?? "auto"];
        if (values.length > 3 || values.some((value) => value.length > 256)) continue;
        const choices = values.flatMap((value) => value.split(",")).filter((value): value is MarketSelection => isMarketSelection(family, value));
        if (choices.length) initialOutcomes[family] = choices;
      }
      let captured = false;
      const clock = { now: () => { if (!captured) { captured = true; return at; } return completionInstant(); } };
      const result = access.tier === "full" && !error && query.build === "1" ? await createGatedReads({ readSlips: read, resolveAccess }).slips(criteria, clock, locale) : null;
      const initialReuse = query.reuse === "0" ? false : query.reuse === "1"
        || Array.isArray(query.reuse) && query.reuse.length === 2 && query.reuse[0] === "0" && query.reuse[1] === "1" ? true : criteria.reuse;
      let jointEstimates = false;
      try { jointEstimates = qualifiedJointModel(jointModel(), at); } catch { /* An unavailable estimator offers no whole-slip limits. */ }
      // A criteria change or browser history navigation resets uncontrolled inputs to this server-owned draft.
      const key = `${Object.keys(query).length ? "draft" : "defaults"}|${serializeSlipCriteria(criteria)}|${JSON.stringify(initialInputs)}|${initialMarkets?.join(",") ?? ""}|${JSON.stringify(initialOutcomes)}|${initialReuse}|${error?.code ?? ""}|${jointEstimates}`;
      return <PublicShell showAccount={showAccount} locale={locale} today={today} current="slips" app compact>
        <SlipBuilder subscriberOnly={access.tier === "free"} signedIn={access.signedIn} showAccount={showAccount} key={key} locale={locale} today={today} criteria={criteria} result={result}
          error={error} initialInputs={initialInputs} initialOutcomes={initialOutcomes} initialReuse={initialReuse} jointEstimates={jointEstimates} {...(initialMarkets ? { initialMarkets } : {})} />
        <SlipHistory slips={await history()} locale={locale} />
      </PublicShell>;
    },
  };
}
