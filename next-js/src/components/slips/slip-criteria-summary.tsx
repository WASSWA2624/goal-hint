import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChartIcon, CalendarIcon, GearIcon, LayersStackIcon, MarketChartIcon, RepeatIcon, ScaleIcon, ShieldCheckIcon,
  SlipIcon, SoccerBallIcon, TargetIcon, TrophyIcon } from "@/components/ui/icons";
import { parseReportingDate } from "@/domain/calendar";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import { formatOddsHundredths } from "@/domain/odds";
import { publicPolicy } from "@/domain/public-policy";
import type { SlipCriteria } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import { slipMarketFilterSummary } from "./slip-market-filter-fields";
import { CriteriaSummary, MarketSummaryValue, SettingsHeader, SettingsHeaderIcon } from "./slip-builder-settings-styles";

export function SlipCriteriaHeading({ id, locale }: { id: string; locale: string }) {
  const m = createMessages(locale);
  return <SettingsHeader>
    <SettingsHeaderIcon>
      <LayersStackIcon data-settings-icon="compact" />
      <GearIcon data-settings-icon="desktop" />
    </SettingsHeaderIcon>
    <div>
      <h2 id={id}>{m.text("slips.summary.title")}</h2>
      <p>{m.text("slips.summary.subtitle")}</p>
    </div>
  </SettingsHeader>;
}

type SettingsIcon = typeof LayersStackIcon;

function Setting({ field, tile, label, value, icon: CompactIcon, desktopIcon: DesktopIcon }: {
  field: string; tile?: "half" | "row"; label: string; value: ReactNode; icon: SettingsIcon; desktopIcon?: SettingsIcon;
}) {
  return <div data-settings-field={field} data-settings-tile={tile}>
    <dt>
      <span data-settings-symbol>
        <CompactIcon viewBox="1 1 22 22" data-settings-icon={DesktopIcon ? "compact" : undefined} />
        {DesktopIcon && <DesktopIcon viewBox="1 1 22 22" data-settings-icon="desktop" />}
      </span>
      <span data-settings-label>{label}</span>
    </dt>
    <dd>{value}</dd>
  </div>;
}

function MarketSummary({ value }: { value: string }) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const container = valueRef.current, text = textRef.current;
    if (!container || !text) return;

    const range = document.createRange();
    range.selectNodeContents(text);
    // Measure against the whole line so the overflow marker cannot keep itself visible.
    const measure = () => setOverflowing(range.getBoundingClientRect().width > container.getBoundingClientRect().width);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    document.fonts.addEventListener("loadingdone", measure);
    measure();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", measure);
    };
  }, [value]);

  return <MarketSummaryValue ref={valueRef}>
    <span ref={textRef}>{value}</span>
    {overflowing && <span aria-hidden="true">+</span>}
  </MarketSummaryValue>;
}

export function SlipCriteriaSummary({ criteria, locale, showJoint }: { criteria: SlipCriteria; locale: string; showJoint: boolean }) {
  const m = createMessages(locale);
  const any = m.text("slips.any");
  const number = (value: number) => m.number(value);
  const percent = (value: number) => `${number(value)}%`;
  const separator = <span data-settings-separator>–</span>;
  function range(minimum: number | undefined, maximum: number | undefined, format = number) {
    if (minimum === maximum) return minimum === undefined ? any : format(minimum);
    return <>{minimum === undefined ? any : format(minimum)}{separator}{maximum === undefined ? any : format(maximum)}</>;
  }
  const dateFrom = m.reportingDateShort(parseReportingDate(criteria.dateFrom));
  const dateTo = m.reportingDateShort(parseReportingDate(criteria.dateTo));
  const timeFrom = criteria.timeFrom || fullDayKickoffTime.from, timeTo = criteria.timeTo || fullDayKickoffTime.to;
  const zone = criteria.interval?.zone;
  const zoneLabel = !zone || zone === publicPolicy.reportingTimeZone ? "EAT" : zone.replaceAll("_", " ");
  const kickoff = criteria.dateFrom === criteria.dateTo ? <>{dateFrom} · {timeFrom}{separator}{timeTo} {zoneLabel}</>
    : `${dateFrom} ${timeFrom} – ${dateTo} ${timeTo} ${zoneLabel}`;
  const markets = slipMarketFilterSummary(m, criteria.markets, criteria.outcomes ?? {});

  return <CriteriaSummary data-slip-criteria-summary>
    <Setting field="slips" label={m.text("slips.totalSlips")} value={number(criteria.slips)} icon={LayersStackIcon} />
    <Setting field="total-odds" label={m.text("slips.mobile.totalOdds")} value={range(criteria.totalMin, criteria.totalMax, formatOddsHundredths)}
      icon={TargetIcon} desktopIcon={TrophyIcon} />
    <Setting field="matches" label={m.text("slips.selectionsRange")} value={range(criteria.teamsMin, criteria.teamsMax)}
      icon={SlipIcon} desktopIcon={LayersStackIcon} />
    <Setting field="individual-odds" tile="half" label={m.text("slips.individualOdds")} value={range(criteria.oddsMin, criteria.oddsMax, formatOddsHundredths)}
      icon={ScaleIcon} desktopIcon={TargetIcon} />
    <Setting field="probability" tile="half" label={m.text("slips.probabilityPercent")} value={range(criteria.probMin, criteria.probMax, percent)}
      icon={ShieldCheckIcon} desktopIcon={BarChartIcon} />
    <Setting field="reuse" tile="row" label={m.text("slips.summary.reuseLabel")}
      value={m.text(criteria.reuse ? "slips.summary.reuseEnabled" : "slips.summary.reuseDisabled")} icon={RepeatIcon} />
    <Setting field="kickoff" tile="row" label={m.text("filters.dateTimeWindow")} value={kickoff} icon={CalendarIcon} />
    <Setting field="markets" tile="row" label={m.text("slips.summary.marketsLabel")}
      value={<MarketSummary value={markets} />} icon={MarketChartIcon} desktopIcon={SoccerBallIcon} />
    {showJoint && <Setting field="joint" tile="row" label={m.text("slips.combinedProbabilityPercent")}
      value={range(criteria.totalProbMin, criteria.totalProbMax, percent)} icon={ShieldCheckIcon} desktopIcon={BarChartIcon} />}
  </CriteriaSummary>;
}
