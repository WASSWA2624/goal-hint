"use client";

import styled, { css, type DefaultTheme } from "styled-components";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import type { OutcomeTone } from "@/styles/theme";

type Tone = OutcomeTone | "total";
/** Square markers and bar segments; items without a prediction take the neutral control grey. */
const toneColor = (theme: DefaultTheme, tone: Exclude<Tone, "total">) =>
  tone === "unavailable" ? theme.color.controlBorder : theme.color.outcome[tone].text;
/** The card lays out on one line once it is this wide, whatever the viewport (cards also sit in narrow grids). */
const wide = "@container (min-width: 56rem)";

const Panel = styled.div`
  container-type: inline-size; min-inline-size: 0; line-height: 1.35;
  border: 1px solid ${({ theme }) => theme.color.border}; border-block-end: 0;
  background: ${({ theme }) => theme.color.surface};
`;
const Body = styled.div`
  padding: 8px 12px 9px;
  ${wide} { display: flex; flex-wrap: wrap; align-items: baseline; row-gap: 1px; padding-inline: 14px; }
`;
const Header = styled.header`
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px;
  > h2, > h3 { font-size: ${({ theme }) => theme.typography.scale.body}; font-weight: ${({ theme }) => theme.typography.weight.bold}; line-height: 1.3; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption}; font-variant-numeric: tabular-nums; }
  ${wide} { flex: none; justify-content: flex-start; gap: 8px; padding-inline-end: 14px; margin-inline-end: 14px;
    border-inline-end: 1px solid ${({ theme }) => theme.color.border}; }
`;
// Phones space the counts across the card; very narrow cards fall back to two even rows instead of one orphan.
const Counts = styled.dl<{ $columns: number }>`
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 6px; margin: 6px 0 0;
  dd { font-size: clamp(${({ theme }) => theme.typography.scale.body}, 3.8cqi, ${({ theme }) => theme.typography.scale.emphasis}); }
  dt { font-size: clamp(${({ theme }) => theme.typography.scale.caption}, 3.3cqi, ${({ theme }) => theme.typography.scale.secondary}); }
  @container (max-width: 19.99rem) {
    display: grid; grid-template-columns: repeat(${({ $columns }) => $columns}, max-content); justify-content: start; gap: 4px 20px;
  }
  ${wide} { flex-wrap: nowrap; justify-content: flex-start; gap: 0 18px; margin: 0;
    dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; } dt { font-size: ${({ theme }) => theme.typography.scale.secondary}; } }
`;
const Extras = styled.dl`
  display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 6px 0 0;
  dd, dt { font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  ${wide} { flex-wrap: nowrap; gap: 0 18px; margin: 0 0 0 18px; dd { font-size: ${({ theme }) => theme.typography.scale.emphasis}; } }
`;
/** Reads "16 Won": the number leads visually while dt stays first for assistive technology. Zero keeps a hollow marker. */
const Fact = styled.div<{ $tone: Tone; $zero: boolean }>`
  display: flex; align-items: baseline; min-inline-size: 0; white-space: nowrap;
  ${({ theme, $tone, $zero }) => $tone !== "total" && css`&::before {
    content: ""; flex: none; inline-size: 8px; block-size: 8px; margin-inline-end: 5px;
    border: 1.5px solid ${toneColor(theme, $tone)}; background: ${$zero ? "transparent" : toneColor(theme, $tone)};
  }`}
  > dd { order: 1; margin: 0; font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums;
    color: ${({ theme, $tone, $zero }) => $zero ? theme.color.mutedText
      : $tone === "total" || $tone === "unavailable" ? theme.color.text : theme.color.outcome[$tone].text}; }
  > dt { order: 2; margin-inline-start: 4px; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Distribution = styled.div`
  display: flex; block-size: 3px; margin-inline: -1px; background: ${({ theme }) => theme.color.border};
`;
// A 2px floor keeps a small outcome (16 of 2,074) visible beside a large no-prediction share.
const Segment = styled.span<{ $tone: Exclude<Tone, "total">; $count: number }>`
  flex: ${({ $count }) => $count} 1 0; min-inline-size: 2px; background: ${({ theme, $tone }) => toneColor(theme, $tone)};
`;

type Item = Readonly<{ label: string; value: number; tone: Tone }>;

/** One compact line of full-period match and slip outcomes, with their distribution as the bottom edge. */
export function PerformanceSummary({ counts, locale, kind, title, period, headingLevel = 2 }: {
  counts: PerformanceSummaryCounts; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; headingLevel?: 2 | 3 | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title");
  const outcomes: Item[] = [
    { label: m.text(`performance.summary.${kind}`), value: counts.total, tone: "total" },
    { label: m.text("performance.won"), value: counts.won, tone: "correct" },
    { label: m.text("performance.lost"), value: counts.lost, tone: "incorrect" },
    { label: m.text("performance.pending"), value: counts.pending, tone: "pending" },
    ...(counts.void ? [{ label: m.text("performance.void"), value: counts.void, tone: "void" } as const] : []),
  ];
  const extras: Item[] = [
    { label: m.text("performance.summary.noPrediction"), value: counts.unavailable ?? 0, tone: "unavailable" as const },
    { label: m.text("performance.filteredOut"), value: counts.filteredOut ?? 0, tone: "unavailable" as const },
  ].filter(({ value }) => value > 0);
  const segments = [
    { tone: "correct", count: counts.won }, { tone: "incorrect", count: counts.lost },
    { tone: "pending", count: counts.pending }, { tone: "void", count: counts.void ?? 0 },
    { tone: "unavailable", count: counts.unavailable ?? 0 }, { tone: "unavailable", count: counts.filteredOut ?? 0 },
  ] as const;
  const fact = ({ label: name, value, tone }: Item) => <Fact key={name} $tone={tone} $zero={value === 0}>
    <dt>{name}</dt><dd>{m.number(value)}</dd></Fact>;
  return <Panel role="group" aria-label={label} data-performance-summary={kind}>
    <Body>
      <Header>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}{period && <p>{period}</p>}</Header>
      <Counts $columns={Math.ceil(outcomes.length / 2)}>{outcomes.map(fact)}</Counts>
      {extras.length > 0 && <Extras>{extras.map(fact)}</Extras>}
    </Body>
    <Distribution aria-hidden="true">{segments.filter(({ count }) => count > 0).map(({ tone, count }, index) =>
      <Segment key={`${tone}-${index}`} $tone={tone} $count={count} />)}</Distribution>
  </Panel>;
}
