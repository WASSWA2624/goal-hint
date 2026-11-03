"use client";

import styled from "styled-components";
import { desktopContentPadding, desktopSectionFrame } from "@/components/ui/layout";
import { controlHeight } from "@/components/ui/control-layout";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { predictedPerformanceSummary, type PerformanceSummaryCounts, type PredictionResult } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const Panel = styled.section`
  min-inline-size: 0; background: ${({ theme }) => theme.color.surface};
  border-radius: ${({ theme }) => theme.radius.none};
  ${desktopSectionFrame}
`;
const Content = styled.div`
  display: grid; gap: var(--gh-spacing-2); min-inline-size: 0;
  padding: ${({ theme }) => theme.layout.sectionPadding};
  ${desktopContentPadding(true)}
`;
const Header = styled.header`
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0;
  h2, h3 { margin: 0; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-bold); line-height: var(--gh-leading-control); }
  time, > p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
  time { margin-inline-start: auto; }
`;
const Period = styled.p`
  margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption);
`;
const Counts = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gh-spacing-1); min-inline-size: 0; margin: 0;
  ${media.desktop} { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--gh-spacing-1_5); }
`;
type Status = PredictionResult | "all";
const Count = styled.div<{ $status: Status }>`
  ${({ theme, $status }) => {
    const tone = $status === "all" ? { text: theme.color.accent.blue.text, background: theme.color.accent.blue.soft }
      : $status === "cancelled" ? { text: theme.color.accent.orange.text, background: theme.color.accent.orange.soft }
        : theme.color.outcome[$status === "won" ? "correct" : $status === "lost" ? "incorrect" : $status === "void" ? "void" : "pending"];
    return `--summary-text: ${tone.text}; --summary-background: ${tone.background};`;
  }}
  ${controlHeight}
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--gh-spacing-0_5); min-inline-size: 0; padding: var(--gh-spacing-1_5) var(--gh-spacing-1);
  box-sizing: border-box; border-radius: ${({ theme }) => theme.radius.small};
  color: var(--summary-text); background: var(--summary-background);
  dt { margin: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label); }
  dd { display: flex; align-items: center; gap: var(--gh-spacing-1); margin: 0; font-size: var(--gh-font-emphasis); font-weight: var(--gh-weight-bold); font-variant-numeric: tabular-nums; }
  dd > svg { display: none; }
  ${media.desktop} { dd > svg { display: block; font-size: var(--gh-font-secondary); } }
`;
const Percentage = styled.span`
  display: none; margin-inline-start: var(--gh-spacing-1); font-size: var(--gh-font-caption); font-weight: var(--gh-weight-body);
  ${media.desktop} { display: inline; }
`;
const Coverage = styled.dl`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-1) var(--gh-spacing-3); margin: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption);
  > div { display: flex; gap: var(--gh-spacing-1); }
  dt, dd { margin: 0; }
`;
const Action = styled.button`
  position: absolute; inset: 0; inline-size: 100%; block-size: 100%; padding: 0;
  border: 0; border-radius: inherit; background: transparent; cursor: pointer;
  &[aria-pressed="true"] { box-shadow: inset 0 0 0 var(--gh-stroke-strong) currentColor; }
  color: inherit;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  &:disabled { cursor: wait; }
`;

/** Shared period outcomes; null counts remain unknown and all six statuses stay visible. */
export function PerformanceSummary({ counts: suppliedCounts, locale, kind, title, period, asOf, headingLevel = 2,
  showCoverage = true, showAll = true, activeResult, onResult, disabled = false, resultAttributes }: {
  counts: PerformanceSummaryCounts | null; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; asOf?: number | undefined; headingLevel?: 2 | 3 | undefined;
  showCoverage?: boolean | undefined; showAll?: boolean;
  activeResult?: PredictionResult | undefined; onResult?: ((result: PredictionResult | undefined) => void) | undefined; disabled?: boolean;
  resultAttributes?: ((result: PredictionResult | undefined) => Record<`data-${string}`, string>) | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title"), pending = suppliedCounts === null;
  const counts = suppliedCounts ?? { total: 0, won: 0, lost: 0, pending: 0 };
  const predicted = kind === "matches" ? predictedPerformanceSummary(counts) : null;
  const number = (value: number) => pending ? "—" : m.number(value);
  const outcomes = [
    { key: "all", label: m.text(showAll ? "performance.summary.all" : `performance.summary.${kind}`), count: showAll && predicted ? predicted.total : counts.total },
    { key: "won", tone: "correct", label: m.text("performance.won"), count: counts.won, icon: CheckIcon },
    { key: "lost", tone: "incorrect", label: m.text("performance.lost"), count: counts.lost, icon: CloseIcon },
    { key: "pending", tone: "pending", label: m.text("performance.pending"), count: counts.pending, icon: ClockIcon },
    { key: "void", label: m.text("performance.void"), count: counts.void ?? 0 },
    { key: "cancelled", label: m.text("performance.cancelled"), count: counts.cancelled ?? 0 },
  ] as const;
  const instant = asOf === undefined ? null : utcInstantFromEpochMilliseconds(asOf);
  return <Panel role="group" aria-label={label} aria-busy={pending || undefined} data-performance-summary={kind}>
    <Content>
      <Header data-performance-heading>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}
        {instant !== null ? <time dateTime={toUtcIsoString(instant)}>{m.reportingInstantCompact(instant)}</time> : period && <p>{period}</p>}
      </Header>
      {instant !== null && period && <Period data-performance-period>{period}</Period>}
      <Counts data-performance-figures>
        {outcomes.map((outcome) => {
          const { key, label, count } = outcome, result = key === "all" ? undefined : key;
          const fraction = key === "won" || key === "lost" || key === "pending" ? predicted?.[key] : null;
          const percentage = !pending && fraction !== null && fraction !== undefined
            ? m.number(fraction, { style: "percent", maximumFractionDigits: 1 }) : null;
          const Icon = "icon" in outcome ? outcome.icon : null;
          return <Count key={key} $status={key} data-summary-card={key} data-summary-outcome={"tone" in outcome ? outcome.tone : undefined}>
            <dt>{label}</dt><dd>{Icon && <Icon aria-hidden="true" />}{number(count)}
              {predicted && "tone" in outcome && <Percentage data-summary-percentage={outcome.tone}>{percentage ? `(${percentage})` : "—"}</Percentage>}
            </dd>
            {onResult && <Action type="button" aria-label={`${label}: ${number(count)}`} aria-pressed={activeResult === result}
              disabled={disabled || pending} data-summary-result={key} {...resultAttributes?.(result)} onClick={() => onResult(result)} />}
          </Count>;
        })}
      </Counts>
      {showCoverage && <Coverage>
        {predicted && !showAll && <div data-summary-predicted><dt>{m.text("performance.summary.predicted")}</dt><dd>{number(predicted.total)}</dd></div>}
        {(counts.unavailable ?? 0) > 0 && <div><dt>{m.text("performance.summary.noPrediction")}</dt><dd>{number(counts.unavailable!)}</dd></div>}
        {(counts.filteredOut ?? 0) > 0 && <div><dt>{m.text("performance.filteredOut")}</dt><dd>{number(counts.filteredOut!)}</dd></div>}
      </Coverage>}
    </Content>
  </Panel>;
}
