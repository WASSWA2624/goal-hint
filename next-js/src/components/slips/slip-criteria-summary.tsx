import { useId } from "react";
import { parseReportingDate } from "@/domain/calendar";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import { formatOddsHundredths } from "@/domain/odds";
import { publicPolicy } from "@/domain/public-policy";
import type { SlipCriteria } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import { allSlipMarketsAutomatic, slipMarketFilterSummary } from "./slip-criteria-fields";
import { CriteriaSummary, CriteriaSummaryPanel } from "./slip-styles";

export function SlipCriteriaSummary({ criteria, locale, showJoint }: { criteria: SlipCriteria; locale: string; showJoint: boolean }) {
  const m = createMessages(locale);
  const heading = useId();
  const any = m.text("slips.any");
  const number = (value: number) => m.number(value);
  const percent = (value: number) => `${number(value)}%`;
  function range(minimum: number | undefined, maximum: number | undefined, format = number) {
    if (minimum === maximum) return minimum === undefined ? any : format(minimum);
    return `${minimum === undefined ? any : format(minimum)}–${maximum === undefined ? any : format(maximum)}`;
  }
  const dateFrom = m.reportingDateShort(parseReportingDate(criteria.dateFrom));
  const dateTo = m.reportingDateShort(parseReportingDate(criteria.dateTo));
  const timeFrom = criteria.timeFrom || fullDayKickoffTime.from, timeTo = criteria.timeTo || fullDayKickoffTime.to;
  const zone = criteria.interval?.zone;
  const zoneLabel = !zone || zone === publicPolicy.reportingTimeZone ? "EAT" : zone.replaceAll("_", " ");
  const kickoff = criteria.dateFrom === criteria.dateTo ? `${dateFrom} · ${timeFrom}–${timeTo} ${zoneLabel}`
    : `${dateFrom} ${timeFrom} – ${dateTo} ${timeTo} ${zoneLabel}`;
  const outcomes = criteria.outcomes ?? {};
  const selection = slipMarketFilterSummary(m, criteria.markets, outcomes);
  const markets = allSlipMarketsAutomatic(criteria.markets, outcomes) ? selection
    : `${m.plural("slips.marketCount", criteria.markets.length)} · ${selection}`;

  return <CriteriaSummaryPanel aria-labelledby={heading}>
    <h2 id={heading}>{m.text("slips.summary.title")}</h2>
    <CriteriaSummary data-slip-criteria-summary>
      <div><dt>{m.text("slips.totalSlips")}</dt><dd>{number(criteria.slips)}</dd></div>
      <div><dt>{m.text("slips.mobile.totalOdds")}</dt><dd>{range(criteria.totalMin, criteria.totalMax, formatOddsHundredths)}</dd></div>
      <div><dt>{m.text("slips.selectionsRange")}</dt><dd>{range(criteria.teamsMin, criteria.teamsMax)}</dd></div>
      <div><dt>{m.text("slips.individualOdds")}</dt><dd>{range(criteria.oddsMin, criteria.oddsMax, formatOddsHundredths)}</dd></div>
      <div><dt>{m.text("slips.probabilityPercent")}</dt><dd>{range(criteria.probMin, criteria.probMax, percent)}</dd></div>
      {showJoint && <div><dt>{m.text("slips.combinedProbabilityPercent")}</dt><dd>{range(criteria.totalProbMin, criteria.totalProbMax, percent)}</dd></div>}
      <div><dt>{m.text("slips.summary.reuseLabel")}</dt><dd>{m.text(criteria.reuse ? "slips.summary.reuseEnabled" : "slips.summary.reuseDisabled")}</dd></div>
      <div data-summary-wide><dt>{m.text("filters.dateTimeWindow")}</dt><dd>{kickoff}</dd></div>
      <div data-summary-wide><dt>{m.text("slips.summary.marketsLabel")}</dt><dd>{markets}</dd></div>
    </CriteriaSummary>
  </CriteriaSummaryPanel>;
}
