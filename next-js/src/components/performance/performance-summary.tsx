"use client";

import styled from "styled-components";
import type { ReactNode } from "react";
import { desktopSectionFrame } from "@/components/ui/layout";
import { controlHeight } from "@/components/ui/control-layout";
import { SectionHeader, sectionHeaderMetadata } from "@/components/ui/section-header";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import { predictedPerformanceSummary, type PerformanceSummaryCounts, type PredictionResult } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const Panel = styled.section`
  container: performance-summary / inline-size;
  min-inline-size: 0; background: ${({ theme }) => theme.color.surface};
  border-radius: ${({ theme }) => theme.radius.none};
  ${desktopSectionFrame}
`;
const Content = styled.div`
  display: grid; gap: var(--gh-spacing-0_75); min-inline-size: 0;
  padding-block-end: var(--gh-spacing-1);
`;
const Header = styled(SectionHeader)`
  justify-content: space-between;
  > p { ${sectionHeaderMetadata} margin-inline-start: auto; text-align: end; }
`;
const Counts = styled.dl`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gh-spacing-1); min-inline-size: 0; margin: 0;
  ${media.desktop} {
    gap: var(--gh-spacing-1_5);
    @container performance-summary (min-width: ${({ theme }) => theme.size[144]}) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  }
`;
const Figures = styled.div`
  display: grid; gap: var(--gh-spacing-1_5); min-inline-size: 0;
  ${media.desktop} {
    &:has(> [data-performance-actions]) { grid-template-columns: minmax(0, 1fr) auto; }
  }
`;
const Actions = styled.div`
  display: flex; min-inline-size: 0;
  > button { flex: 1; }
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
  dt { display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1); margin: 0; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label); }
  dd { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: var(--gh-spacing-1); min-inline-size: 0; max-inline-size: 100%; margin: 0; font-size: var(--gh-font-emphasis); font-weight: var(--gh-weight-bold); font-variant-numeric: tabular-nums; }
  dt, [data-summary-count] { max-inline-size: 100%; overflow-wrap: anywhere; text-align: center; }
  dt > svg { display: none; }
  ${media.desktop} { dt > svg { display: block; flex: none; font-size: var(--gh-font-secondary); } }
`;
const Percentage = styled.span`
  display: none; margin-inline-start: var(--gh-spacing-1); font-size: var(--gh-font-caption); font-weight: var(--gh-weight-body);
  ${media.desktop} { @container performance-summary (min-width: ${({ theme }) => theme.size[144]}) { display: inline; } }
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
  &[aria-pressed="true"] { box-shadow: inset 0 0 0 var(--gh-stroke-thin) color-mix(in srgb, currentColor ${({ theme }) => theme.opacity[40]! * 100}%, transparent); }
  color: inherit;
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  ${media.hover} { &:hover:not(:disabled):not([aria-pressed="true"]) { box-shadow: inset 0 0 0 var(--gh-stroke-thin) currentColor; } }
  &:disabled { cursor: wait; }
`;

const outcomes = [
  { key: "all", message: "performance.summary.all" },
  { key: "won", tone: "correct", message: "performance.won", icon: CheckIcon },
  { key: "lost", tone: "incorrect", message: "performance.lost", icon: CloseIcon },
  { key: "pending", tone: "pending", message: "performance.pending", icon: ClockIcon },
  { key: "void", message: "performance.void" },
  { key: "cancelled", message: "performance.cancelled" },
] as const;

/** Shared period outcomes; null counts remain unknown and all six statuses stay visible. */
export function PerformanceSummary({ counts: suppliedCounts, locale, kind, title, period, actions, headingLevel = 2,
  showCoverage = true, showAll = true, activeResult, onResult, disabled = false, resultAttributes }: {
  counts: PerformanceSummaryCounts | null; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; headingLevel?: 2 | 3 | undefined;
  actions?: ReactNode;
  showCoverage?: boolean | undefined; showAll?: boolean;
  activeResult?: PredictionResult | undefined; onResult?: ((result: PredictionResult | undefined) => void) | undefined; disabled?: boolean;
  resultAttributes?: ((result: PredictionResult | undefined) => Record<`data-${string}`, string>) | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title"), pending = suppliedCounts === null;
  const counts = suppliedCounts ?? { total: 0, won: 0, lost: 0, pending: 0 };
  const predicted = kind === "matches" ? predictedPerformanceSummary(counts) : null;
  const number = (value: number) => pending ? "—" : m.number(value);
  return <Panel role="group" aria-label={label} aria-busy={pending || undefined} data-performance-summary={kind}>
    <Content>
      <Header data-performance-heading>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}
        {period && <p data-performance-period>{period}</p>}
      </Header>
      <Figures><Counts data-performance-figures>
        {outcomes.map((outcome) => {
          const { key } = outcome, result = key === "all" ? undefined : key;
          const label = m.text(key === "all" && !showAll ? `performance.summary.${kind}` : outcome.message);
          const count = key === "all" ? (showAll && predicted ? predicted.total : counts.total) : counts[key] ?? 0;
          const fraction = key === "all" ? null : predicted
            ? (predicted.total > 0 ? count / predicted.total : null) : counts.total > 0 ? count / counts.total : null;
          const percentage = !pending && fraction !== null && fraction !== undefined
            ? m.number(fraction, { style: "percent", maximumFractionDigits: 1 }) : null;
          const Icon = "icon" in outcome ? outcome.icon : null;
          return <Count key={key} $status={key} data-summary-card={key} data-summary-outcome={"tone" in outcome ? outcome.tone : undefined}>
            <dt>{Icon && <Icon aria-hidden="true" />}{label}</dt><dd><span data-summary-count={key}>{number(count)}</span>
              {key !== "all" && <Percentage data-summary-percentage={"tone" in outcome ? outcome.tone : key}>{percentage ? `(${percentage})` : "—"}</Percentage>}
            </dd>
            {onResult && <Action type="button" aria-label={`${label}: ${number(count)}`} aria-pressed={activeResult === result}
              disabled={disabled || pending} data-summary-result={key} {...resultAttributes?.(result)} onClick={() => onResult(result)} />}
          </Count>;
        })}
      </Counts>{actions && <Actions data-performance-actions>{actions}</Actions>}</Figures>
      {showCoverage && (predicted && !showAll || (counts.unavailable ?? 0) > 0 || (counts.filteredOut ?? 0) > 0) && <Coverage>
        {predicted && !showAll && <div data-summary-predicted><dt>{m.text("performance.summary.predicted")}</dt><dd>{number(predicted.total)}</dd></div>}
        {(counts.unavailable ?? 0) > 0 && <div><dt>{m.text("performance.summary.noPrediction")}</dt><dd>{number(counts.unavailable!)}</dd></div>}
        {(counts.filteredOut ?? 0) > 0 && <div><dt>{m.text("performance.filteredOut")}</dt><dd>{number(counts.filteredOut!)}</dd></div>}
      </Coverage>}
    </Content>
  </Panel>;
}
