"use client";

import styled, { css } from "styled-components";
import { desktopSectionFrame } from "@/components/ui/layout";
import { controlHeight } from "@/components/ui/control-layout";
import { SectionHeader, sectionHeaderMetadata } from "@/components/ui/section-header";
import { CheckIcon, ClockIcon, CloseIcon } from "@/components/ui/icons";
import { predictedPerformanceSummary, type PerformanceSummaryCounts, type PredictionResult, type PredictionResultFilter } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import { performanceResultColors } from "@/styles/performance-result-colors";
import { media } from "@/styles/theme";

const Panel = styled.section`
  container: performance-summary / inline-size;
  min-inline-size: 0; background: ${({ theme }) => theme.color.surface};
  border-radius: ${({ theme }) => theme.radius.none};
  ${desktopSectionFrame}
`;
const Content = styled.div<{ $compactHeader: boolean }>`
  display: grid; gap: ${({ $compactHeader }) => $compactHeader ? "var(--gh-spacing-0_25)" : "var(--gh-spacing-0_75)"}; min-inline-size: 0;
  padding-block-end: var(--gh-spacing-1);
`;
const Header = styled(SectionHeader)<{ $compactHeader: boolean }>`
  justify-content: space-between;
  ${({ $compactHeader }) => $compactHeader && css`padding-block-end: 0; padding-inline: 0;`}
  > p { ${sectionHeaderMetadata} margin-inline-start: auto; text-align: end; }
`;
const Counts = styled.dl<{ $compact: boolean; $mobileOutcomes: boolean }>`
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gh-spacing-1); min-inline-size: 0; margin: 0;
  ${({ $mobileOutcomes }) => $mobileOutcomes && css`
    ${media.belowDesktop} {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--gh-spacing-0_75);
    }
  `}
  ${media.desktop} {
    gap: var(--gh-spacing-1_5);
    ${({ $compact, theme }) => $compact ? "grid-template-columns: repeat(6, minmax(0, 1fr));" : css`
      @container performance-summary (min-width: ${theme.size[144]}) { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    `}
  }
`;

type Status = PredictionResultFilter | "all";
type Visibility = "desktop" | "mobile" | undefined;
const Count = styled.div<{ $status: Status; $compact: boolean; $visibility: Visibility; $mobileOutcomes: boolean }>`
  ${({ theme, $status }) => {
    const tone = performanceResultColors(theme, $status === "others" ? "void" : $status);
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
  ${({ $visibility }) => $visibility === "desktop" && css`${media.belowDesktop} { display: none; }`}
  ${({ $visibility }) => $visibility === "mobile" && css`${media.desktop} { display: none; }`}
  ${media.desktop} { dt > svg { display: block; flex: none; font-size: var(--gh-font-secondary); } }
  ${({ $compact, theme }) => $compact && css`
    dt { font-size: var(--gh-font-body); }
    dd { flex-wrap: nowrap; line-height: var(--gh-leading-label); }
    dt, [data-summary-count] { white-space: nowrap; overflow-wrap: normal; }
    @container performance-summary (max-width: ${theme.viewport[22.5]}) {
      padding-inline: var(--gh-spacing-0_5);
      dd { gap: var(--gh-spacing-0_5); font-size: var(--gh-font-body); }
    }
    ${media.desktop} {
      dd { font-size: var(--gh-font-reading); }
    }
  `}
  ${({ $mobileOutcomes }) => $mobileOutcomes && css`
    ${media.belowDesktop} {
      padding-inline: var(--gh-spacing-0_75);
      dt { font-size: var(--gh-font-secondary); }
      dd { flex-wrap: wrap; gap: 0 var(--gh-spacing-0_5); }
      dd > span { flex: none; }
    }
  `}
`;
const Percentage = styled.span<{ $compact: boolean }>`
  font-size: var(--gh-font-caption); font-weight: var(--gh-weight-body); white-space: nowrap;
  ${({ $compact, theme }) => $compact ? css`
    font-size: var(--gh-font-secondary);
    @container performance-summary (max-width: ${theme.viewport[22.5]}) { font-size: var(--gh-font-caption); }
  ` : css`${media.desktop} {
    display: none; margin-inline-start: var(--gh-spacing-1);
    @container performance-summary (min-width: ${theme.size[144]}) { display: inline; }
  }`}
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
  &:disabled { cursor: default; }
  [aria-busy="true"] &:disabled { cursor: wait; }
`;

const outcomes = [
  { key: "all", message: "performance.summary.all" },
  { key: "won", tone: "correct", message: "performance.won", icon: CheckIcon },
  { key: "lost", tone: "incorrect", message: "performance.lost", icon: CloseIcon },
  { key: "pending", tone: "pending", message: "performance.pending", icon: ClockIcon },
  { key: "void", message: "performance.void" },
  { key: "cancelled", message: "performance.cancelled" },
] as const;

const [all, won, lost, pending, voided, cancelled] = outcomes;
const others = { key: "others", message: "performance.others" } as const;
// Keep the visible reading and keyboard order aligned in both layouts.
const responsiveOutcomes = [
  { outcome: all, visibility: "desktop" }, { outcome: won, visibility: undefined },
  { outcome: lost, visibility: "desktop" }, { outcome: pending, visibility: undefined },
  { outcome: lost, visibility: "mobile" }, { outcome: voided, visibility: "desktop" },
  { outcome: cancelled, visibility: "desktop" }, { outcome: others, visibility: "mobile" },
] as const;
const defaultOutcomes = outcomes.map(outcome => ({ outcome, visibility: undefined }));

/** Shared period outcomes including optional compact browsing filters. */
export function PerformanceSummary({ counts: suppliedCounts, locale, kind, title, period, headingLevel = 2,
  showCoverage = true, showAll = true, activeResult, onResult, onOthers, disabled = false, loading = false, resultAttributes, compactHeader = false }: {
  counts: PerformanceSummaryCounts | null; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; headingLevel?: 2 | 3 | undefined;
  compactHeader?: boolean;
  loading?: boolean | "background";
  showCoverage?: boolean | undefined; showAll?: boolean;
  activeResult?: PredictionResultFilter | undefined; onOthers?: (() => void) | undefined; onResult?: ((result: PredictionResult | undefined) => void) | undefined; disabled?: boolean;
  resultAttributes?: ((result: PredictionResult | undefined) => Record<`data-${string}`, string>) | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title"), unknown = suppliedCounts === null;
  const counts = suppliedCounts ?? { total: 0, won: 0, lost: 0, pending: 0 };
  const predicted = kind === "matches" ? predictedPerformanceSummary(counts) : null;
  const showPredicted = predicted && !showAll;
  const number = (value: number) => unknown ? "—" : m.number(value);
  const cards = onOthers ? responsiveOutcomes : defaultOutcomes;
  return <Panel role="group" aria-label={label} aria-busy={loading ? true : undefined}
    data-navigation-passive={loading === "background" ? "" : undefined} data-performance-summary={kind}>
    <Content $compactHeader={compactHeader}>
      <Header $compactHeader={compactHeader} data-performance-heading>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}
        {period && <p data-performance-period>{period}</p>}
      </Header>
      <Counts $compact={compactHeader} $mobileOutcomes={!!onOthers} data-performance-figures>
        {cards.map(({ outcome, visibility }) => {
          const { key } = outcome, result = key === "all" ? undefined : key;
          const label = m.text(key === "all" && !showAll ? `performance.summary.${kind}` : outcome.message);
          const count = key === "all" ? (showAll && predicted ? predicted.total : counts.total)
            : key === "others" ? (counts.void ?? 0) + (counts.cancelled ?? 0) : counts[key] ?? 0;
          const fraction = key === "all" ? null : predicted
            ? (predicted.total > 0 ? count / predicted.total : null) : counts.total > 0 ? count / counts.total : null;
          const percentage = !unknown && fraction !== null && fraction !== undefined
            ? m.number(fraction, { style: "percent", maximumFractionDigits: 1 }) : null;
          const Icon = "icon" in outcome ? outcome.icon : null;
          const action = result === "others" ? onOthers : onResult && (() => onResult(result));
          const attributes = result === "others" ? undefined : resultAttributes?.(result);
          return <Count key={`${key}:${visibility ?? "shared"}`} $status={key} $compact={compactHeader} $visibility={visibility}
            $mobileOutcomes={!!onOthers} data-summary-card={key} data-summary-outcome={"tone" in outcome ? outcome.tone : undefined}>
            <dt>{Icon && <Icon aria-hidden="true" />}{label}</dt><dd><span data-summary-count={key}>{number(count)}</span>
              {key !== "all" && <Percentage $compact={compactHeader} data-summary-percentage={"tone" in outcome ? outcome.tone : key}>{percentage ? `(${percentage})` : "—"}</Percentage>}
            </dd>
            {action && <Action type="button" aria-label={`${label}: ${number(count)}`} aria-pressed={activeResult === result}
              disabled={disabled || unknown} data-summary-result={key} {...attributes} onClick={action} />}
          </Count>;
        })}
      </Counts>
      {showCoverage && (showPredicted || (counts.unavailable ?? 0) > 0 || (counts.filteredOut ?? 0) > 0) && <Coverage>
        {showPredicted && <div data-summary-predicted>
          <dt>{m.text("performance.summary.predicted")}</dt>
          <dd>{number(predicted.total)}</dd>
        </div>}
        {(counts.unavailable ?? 0) > 0 && <div data-summary-unavailable>
          <dt>{m.text("performance.summary.noPrediction")}</dt><dd>{number(counts.unavailable ?? 0)}</dd>
        </div>}
        {(counts.filteredOut ?? 0) > 0 && <div><dt>{m.text("performance.filteredOut")}</dt><dd>{number(counts.filteredOut!)}</dd></div>}
      </Coverage>}
    </Content>
  </Panel>;
}
