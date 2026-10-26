"use client";

import styled from "styled-components";
import type { PerformanceSummaryCounts } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";
import type { OutcomeTone } from "@/styles/theme";

const Panel = styled.div`
  min-inline-size: 0; border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.surface}; border-radius: 0;
`;
const Header = styled.header`
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 4px 12px; padding: 9px 12px 0;
  > h2, > h3 { font-size: 0.75rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
`;
const Counts = styled.dl`
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 10px 0;
  > div { display: flex; flex-direction: column-reverse; gap: 3px; min-inline-size: 0; padding-inline: 12px; }
  > div + div { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; }
  dd { margin: 0; font-size: clamp(1.125rem, 4.5vw, 1.5rem); line-height: 1.1;
    font-weight: ${({ theme }) => theme.typography.weight.heavy}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  @media (max-width: 22.5rem) { > div { padding-inline: 8px; } }
`;
const Value = styled.dd<{ $tone?: OutcomeTone }>`
  color: ${({ theme, $tone }) => $tone ? theme.color.outcome[$tone].text : theme.color.text};
`;
const Footer = styled.div`
  display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0 12px 9px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem;
  > p { flex-basis: 100%; }
  strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; font-variant-numeric: tabular-nums; }
`;
const Distribution = styled.div`
  display: flex; block-size: 3px; overflow: hidden; background: ${({ theme }) => theme.color.border};
`;
const Segment = styled.span<{ $tone: OutcomeTone; $count: number }>`
  flex: ${({ $count }) => $count} 1 0;
  background: ${({ theme, $tone }) => theme.color.outcome[$tone].text};
`;

/** One compact, accessible presentation for full-period match and slip outcomes. */
export function PerformanceSummary({ counts, locale, kind, title, period, description, headingLevel = 2 }: {
  counts: PerformanceSummaryCounts; locale: string; kind: "matches" | "slips" | "predictions";
  title?: string | undefined; period?: string | undefined; description?: string | undefined; headingLevel?: 2 | 3 | undefined;
}) {
  const m = createMessages(locale), label = title ?? m.text("performance.summary.title");
  const segments = [
    { tone: "correct", count: counts.won }, { tone: "incorrect", count: counts.lost },
    { tone: "pending", count: counts.pending }, { tone: "void", count: counts.void ?? 0 },
    { tone: "unavailable", count: counts.unavailable ?? 0 },
    { tone: "unavailable", count: counts.filteredOut ?? 0 },
  ] as const;
  const extra = Boolean(counts.void || counts.unavailable || counts.filteredOut || description);
  return <Panel role="group" aria-label={label} data-performance-summary={kind}>
    <Header>{headingLevel === 3 ? <h3>{label}</h3> : <h2>{label}</h2>}{period && <p>{period}</p>}</Header>
    <Counts>
      <div><dt>{m.text(`performance.summary.${kind}`)}</dt><Value>{m.number(counts.total)}</Value></div>
      <div><dt>{m.text("performance.won")}</dt><Value $tone="correct">{m.number(counts.won)}</Value></div>
      <div><dt>{m.text("performance.lost")}</dt><Value $tone="incorrect">{m.number(counts.lost)}</Value></div>
      <div><dt>{m.text("performance.pending")}</dt><Value $tone="pending">{m.number(counts.pending)}</Value></div>
    </Counts>
    {extra && <Footer>
      {!!counts.void && <span>{m.text("performance.void")}: <strong>{m.number(counts.void)}</strong></span>}
      {!!counts.unavailable && <span>{m.text("performance.summary.noPrediction")}: <strong>{m.number(counts.unavailable)}</strong></span>}
      {!!counts.filteredOut && <span>{m.text("performance.filteredOut")}: <strong>{m.number(counts.filteredOut)}</strong></span>}
      {description && <p>{description}</p>}
    </Footer>}
    <Distribution aria-hidden="true">{segments.filter(({ count }) => count > 0).map(({ tone, count }, index) =>
      <Segment key={`${tone}-${index}`} $tone={tone} $count={count} />)}</Distribution>
  </Panel>;
}
