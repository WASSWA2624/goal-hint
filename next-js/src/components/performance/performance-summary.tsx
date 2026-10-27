"use client";

import styled from "styled-components";
import { OutcomeBadge } from "@/components/match/prediction-presentation";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import type { OutcomeTone } from "@/styles/theme";

const wide = "@container performance-summary (min-width: 56rem)";

const Panel = styled.div`
  container: performance-summary / inline-size;
  min-inline-size: 0; border: 1px solid ${({ theme }) => theme.color.border}; border-block-end: 0;
  background: ${({ theme }) => theme.color.surface}; border-radius: 0; line-height: 1.35;
`;
const Content = styled.div`
  padding: 8px 12px 9px;
  ${wide} {
    display: flex; flex-wrap: wrap; align-items: center; row-gap: 6px; padding-inline: 14px;
  }
`;
const Header = styled.header`
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px;
  > h2, > h3 { font-size: 0.8125rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-variant-numeric: tabular-nums; }
  ${wide} {
    flex: none; max-inline-size: 100%; justify-content: flex-start; gap: 8px;
    padding-inline-end: 14px; margin-inline-end: 14px; border-inline-end: 1px solid ${({ theme }) => theme.color.border};
  }
`;
const Counts = styled.dl<{ $fill: boolean }>`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  min-inline-size: 0; margin: 6px 0 0;
  ${wide} {
    margin: 0;
    flex-grow: ${({ $fill }) => $fill ? 1 : 0}; padding-inline-end: ${({ $fill }) => $fill ? "24px" : "0"};
  }
`;
const Count = styled.div<{ $tone?: OutcomeTone; $zero?: boolean }>`
  --summary-tone: ${({ theme, $tone }) => $tone === "unavailable" ? theme.color.controlBorder
    : $tone ? theme.color.outcome[$tone].text : theme.color.text};
  display: flex; align-items: baseline; min-inline-size: 0; white-space: nowrap;
  &::before {
    content: ${({ $tone }) => $tone ? '""' : "none"}; order: 0; flex: none;
    inline-size: 8px; block-size: 8px; margin-inline-end: 5px;
    background: ${({ $zero }) => $zero ? "transparent" : "var(--summary-tone)"}; border: 1.5px solid var(--summary-tone);
  }
  dd {
    order: 1; margin: 0; font-size: 0.875rem;
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
    color: ${({ theme, $tone, $zero }) => $zero ? theme.color.mutedText
      : $tone === "unavailable" ? theme.color.text : "var(--summary-tone)"};
  }
  dt { order: 2; margin-inline-start: 4px; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
`;
const OutcomeCount = styled(OutcomeBadge)<{ $outcome: "correct" | "incorrect" | "pending" }>`
  flex: 1 0 0; min-inline-size: max-content; max-inline-size: 8.625rem;
  min-block-size: 33px; padding: 4px 6px;
  border: 0; border-radius: 0; white-space: nowrap;
  color: ${({ theme, $outcome }) => theme.color.performanceOutcome[$outcome].text};
  background: ${({ theme, $outcome }) => theme.color.performanceOutcome[$outcome].background};
  font-size: 0.875rem; line-height: 1.3; font-variant-numeric: tabular-nums;
  dt, dd { margin: 0; color: inherit; font: inherit; }
  dt { order: 2; }
  dd { display: inline-flex; align-items: center; gap: 4px; order: 1; }
  dd > svg { flex: none; font-size: 0.875rem; }
`;
const Extras = styled.dl`
  display: flex; flex-wrap: wrap; gap: 4px 10px; min-inline-size: 0; margin: 6px 0 0;
  dd, dt { font-size: 0.75rem; }
  ${wide} {
    flex-grow: 1; gap: 4px 18px; margin: 0; margin-inline-start: 18px; padding-inline-end: 24px;
    dd { font-size: 0.875rem; }
  }
`;
const Distribution = styled.div`
  display: flex; block-size: 3px; margin-inline: -1px; background: ${({ theme }) => theme.color.border};
`;
const Segment = styled.span<{ $tone: OutcomeTone }>`
  flex-basis: 0; min-inline-size: 2px;
  background: ${({ theme, $tone }) => $tone === "unavailable" ? theme.color.controlBorder : theme.color.outcome[$tone].text};
`;

/** One compact, accessible presentation for full-period match and slip outcomes. */
export function PerformanceSummary({ counts, locale, kind, title, period, headingLevel = 2, showCoverage = true }: {
  counts: PerformanceSummaryCounts; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; headingLevel?: 2 | 3 | undefined;
  showCoverage?: boolean | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title");
  const outcomes = [
    { tone: "correct", label: m.text("performance.won"), count: counts.won, icon: CheckIcon },
    { tone: "incorrect", label: m.text("performance.lost"), count: counts.lost, icon: CloseIcon },
    { tone: "pending", label: m.text("performance.pending"), count: counts.pending, icon: ClockIcon },
  ] as const;
  const coverage = [
    { key: "unavailable", tone: "unavailable" as const, label: m.text("performance.summary.noPrediction"), count: counts.unavailable ?? 0 },
    { key: "filteredOut", tone: "unavailable" as const, label: m.text("performance.filteredOut"), count: counts.filteredOut ?? 0 },
  ].filter(({ count }) => count > 0);
  const voidOutcome = { key: "void", tone: "void" as const, label: m.text("performance.void"), count: counts.void ?? 0 };
  const extras = [voidOutcome, ...coverage.filter(({ key }) => showCoverage || key !== "unavailable")]
    .filter(({ count }) => count > 0);
  const segments = [...outcomes, voidOutcome, ...coverage];
  return <Panel role="group" aria-label={label} data-performance-summary={kind}>
    <Content>
      <Header>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}{period && <p>{period}</p>}</Header>
      <Counts $fill={extras.length === 0}>
        {showCoverage && <Count $zero={counts.total === 0}><dt>{m.text(`performance.summary.${kind}`)}</dt><dd>{m.number(counts.total)}</dd></Count>}
        {outcomes.map(({ tone, label, count, icon: OutcomeIcon }) => <OutcomeCount as="div" key={tone} $outcome={tone} data-summary-outcome={tone}>
          <dt>{label}</dt><dd><OutcomeIcon />{m.number(count)}</dd>
        </OutcomeCount>)}
      </Counts>
      {extras.length > 0 && <Extras>{extras.map(({ key, tone, label, count }) => <Count key={key} $tone={tone}>
        <dt>{label}</dt><dd>{m.number(count)}</dd>
      </Count>)}</Extras>}
    </Content>
    <Distribution aria-hidden="true">{segments.filter(({ count }) => count > 0).map(({ tone, label, count }) =>
      <Segment key={label} $tone={tone} style={{ flexGrow: count }} />)}</Distribution>
  </Panel>;
}
