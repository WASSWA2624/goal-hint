"use client";

import styled, { css } from "styled-components";
import { desktopContentPadding, desktopSectionFrame } from "@/components/ui/layout";
import { OutcomeBadge } from "@/components/match/prediction-presentation";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import { predictedPerformanceSummary, type PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import { media, type OutcomeTone } from "@/styles/theme";

const wide = css`@container performance-summary (min-width: ${({ theme }) => theme.size[224]})`;

const Panel = styled.div`
  container: performance-summary / inline-size;
  position: relative; min-inline-size: 0; block-size: max(var(--gh-size-11), var(--gh-size-11)); box-sizing: border-box;
  border: 0;
  background: ${({ theme }) => theme.color.surface}; border-radius: ${({ theme }) => theme.radius.surface}; line-height: var(--gh-leading-caption);
  ${media.desktop} { block-size: var(--gh-size-9); }
  ${desktopSectionFrame}
  @media (pointer: coarse) { block-size: max(var(--gh-size-11), var(--gh-size-11)); ${media.desktop} { block-size: max(var(--gh-size-11), var(--gh-size-9)); } }
`;
const Content = styled.div`
  display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gh-spacing-0_25);
  block-size: 100%; min-inline-size: 0; padding: var(--gh-spacing-0_75) var(--gh-spacing-2) var(--gh-spacing-1_25); box-sizing: border-box;
  ${media.desktop} { display: flex; align-items: center; gap: var(--gh-spacing-3); padding: var(--gh-spacing-0_75) var(--gh-spacing-3) var(--gh-spacing-1_25); }
  ${desktopContentPadding(true)}
`;
const Header = styled.header`
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--gh-spacing-2);
  min-inline-size: 0; overflow-x: auto; white-space: nowrap; scrollbar-width: none;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  > h2, > h3 { flex: none; font-size: var(--gh-font-caption); font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: var(--gh-leading-control); }
  > p { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); line-height: var(--gh-leading-control); font-variant-numeric: tabular-nums; }
  ${media.desktop} {
    display: grid; flex: none; gap: var(--gh-spacing-0_25); max-inline-size: 40%;
    padding-inline-end: var(--gh-spacing-3); border-inline-end: 0;
  }
`;
/** One focusable strip preserves every figure at phone widths without increasing the summary height. */
const Figures = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0;
  overflow-x: auto; overflow-y: hidden; overscroll-behavior-inline: contain;
  scrollbar-width: thin; scrollbar-color: ${({ theme }) => theme.color.border} transparent;
  &::-webkit-scrollbar { block-size: var(--gh-size-0_75); }
  &::-webkit-scrollbar-thumb { background: ${({ theme }) => theme.color.border}; }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  ${media.desktop} { flex: 1; align-self: stretch; }
`;
const Counts = styled.dl`
  display: flex; flex: none; flex-wrap: nowrap; align-items: center; gap: var(--gh-spacing-1_5);
  inline-size: max-content; margin: 0;
`;
const Count = styled.div<{ $tone?: OutcomeTone; $zero?: boolean }>`
  --summary-tone: ${({ theme, $tone }) => $tone === "unavailable" ? theme.color.controlBorder
    : $tone ? theme.color.outcome[$tone].text : theme.color.text};
  display: flex; align-items: baseline; min-inline-size: 0; white-space: nowrap;
  &::before {
    content: ${({ $tone }) => $tone ? '""' : "none"}; order: 0; flex: none;
    inline-size: var(--gh-size-1_5); block-size: var(--gh-size-1_5); margin-inline-end: var(--gh-spacing-1);
    background: ${({ $zero }) => $zero ? "transparent" : "var(--summary-tone)"}; border: 0;
  }
  dd {
    order: 1; margin: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-heading);
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
    color: ${({ theme, $tone, $zero }) => $zero ? theme.color.mutedText
      : $tone === "unavailable" ? theme.color.text : "var(--summary-tone)"};
  }
  dt { order: 2; margin-inline-start: var(--gh-spacing-1); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-micro); line-height: var(--gh-leading-heading); }
`;
const OutcomeCount = styled(OutcomeBadge)<{ $outcome: "correct" | "incorrect" | "pending" }>`
  flex: none; min-inline-size: max-content; min-block-size: var(--gh-size-4); padding: 0 var(--gh-spacing-1);
  border: 0; border-radius: ${({ theme }) => theme.radius.small}; white-space: nowrap;
  color: ${({ theme, $outcome }) => theme.color.performanceOutcome[$outcome].text};
  background: ${({ theme, $outcome }) => theme.color.performanceOutcome[$outcome].background};
  font-size: var(--gh-font-caption); line-height: var(--gh-leading-heading); font-variant-numeric: tabular-nums;
  dt, dd { margin: 0; color: inherit; font: inherit; }
  dt { order: 2; }
  dd { display: inline-flex; align-items: center; gap: var(--gh-spacing-1); order: 1; }
  dd { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  dd > svg { flex: none; font-size: var(--gh-font-micro); }
`;
const PredictedCount = styled(Count)`
  flex: none;
`;
const OutcomePercentage = styled.span`
  display: none;
  ${wide} { display: inline; margin-inline-start: var(--gh-spacing-1); font-size: var(--gh-font-micro); font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
const Extras = styled.dl`
  display: flex; flex: none; gap: var(--gh-spacing-2); margin: 0; padding-inline-start: var(--gh-spacing-2);
  border-inline-start: 0;
`;
/** One compact, accessible presentation for full-period match and slip outcomes. */
export function PerformanceSummary({ counts, locale, kind, title, period, headingLevel = 2, showCoverage = true }: {
  counts: PerformanceSummaryCounts; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; headingLevel?: 2 | 3 | undefined;
  showCoverage?: boolean | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title");
  const predicted = kind === "matches" ? predictedPerformanceSummary(counts) : null;
  const outcomes = [
    { key: "won", tone: "correct", label: m.text("performance.won"), count: counts.won, icon: CheckIcon },
    { key: "lost", tone: "incorrect", label: m.text("performance.lost"), count: counts.lost, icon: CloseIcon },
    { key: "pending", tone: "pending", label: m.text("performance.pending"), count: counts.pending, icon: ClockIcon },
  ] as const;
  const coverage = [
    { key: "unavailable", tone: "unavailable" as const, label: m.text("performance.summary.noPrediction"), count: counts.unavailable ?? 0 },
    { key: "filteredOut", tone: "unavailable" as const, label: m.text("performance.filteredOut"), count: counts.filteredOut ?? 0 },
  ].filter(({ count }) => count > 0);
  const voidOutcome = { key: "void", tone: "void" as const, label: m.text("performance.void"), count: counts.void ?? 0 };
  const cancelledOutcome = { key: "cancelled", tone: "void" as const, label: m.text("performance.cancelled"), count: counts.cancelled ?? 0 };
  const extras = [voidOutcome, cancelledOutcome, ...coverage.filter(({ key }) => showCoverage || key !== "unavailable")]
    .filter(({ count }) => count > 0);
  return <Panel role="group" aria-label={label} data-performance-summary={kind}>
    <Content>
      <Header tabIndex={0} data-performance-heading>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}{period && <p>{period}</p>}</Header>
      <Figures tabIndex={0} role="region" aria-label={`${label}: ${m.text("performance.summary.figures")}`} data-performance-figures>
      <Counts>
        {showCoverage && <Count $zero={counts.total === 0}><dt>{m.text(`performance.summary.${kind}`)}</dt><dd>{m.number(counts.total)}</dd></Count>}
        {predicted && <PredictedCount $zero={predicted.total === 0} data-summary-predicted>
          <dt>{m.text("performance.summary.predicted")}</dt><dd>{m.number(predicted.total)}</dd>
        </PredictedCount>}
        {outcomes.map(({ key, tone, label, count, icon: OutcomeIcon }) => {
          const fraction = predicted?.[key], percentage = fraction === null || fraction === undefined ? null
            : m.number(fraction, { style: "percent", maximumFractionDigits: 1 });
          return <OutcomeCount as="div" key={tone} $outcome={tone} data-summary-outcome={tone}>
            <dt>{label}{predicted && <OutcomePercentage data-summary-percentage={tone}
              title={percentage ? m.text("performance.summary.percentageOfPredicted", { percentage }) : m.text("performance.summary.noPredicted")}>
              {percentage ? `(${percentage})` : "—"}
            </OutcomePercentage>}</dt><dd><OutcomeIcon />{m.number(count)}</dd>
          </OutcomeCount>;
        })}
      </Counts>
      {extras.length > 0 && <Extras>{extras.map(({ key, tone, label, count }) => <Count key={key} $tone={tone}>
        <dt>{label}</dt><dd>{m.number(count)}</dd>
      </Count>)}</Extras>}
      </Figures>
    </Content>
  </Panel>;
}
