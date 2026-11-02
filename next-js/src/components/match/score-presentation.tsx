"use client";

import styled, { keyframes } from "styled-components";

/** Larger figures and a wider separator fit inside the existing score slot. */
export const Scoreline = styled.span`
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--gh-font-section); font-weight: ${({ theme }) => theme.typography.weight.bold};
  /* Retain the original 13px × 1.3 line box so compact cards do not grow. */
  line-height: var(--gh-size-4_225); font-variant-numeric: tabular-nums; white-space: nowrap;
  [data-score-separator] { flex: none; inline-size: var(--gh-size-4); text-align: center; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  [data-status="live"] & { color: ${({ theme }) => theme.color.live.text}; }
`;

export function ScoreFigures({ home, away, lead = 0 }: { home: string; away: string; lead?: number }) {
  return <><span data-score-home data-loss={lead < 0 || undefined}>{home}</span>
    <span data-score-separator>–</span><span data-score-away data-loss={lead > 0 || undefined}>{away}</span></>;
}

const minuteGlow = keyframes`
  0%, 100% { text-shadow: 0 0 var(--gh-size-0_25) currentColor; }
  50% { text-shadow: 0 0 var(--gh-size-1) currentColor, 0 0 var(--gh-size-1_5) currentColor; }
`;

const MinuteMarker = styled.span`
  animation: ${minuteGlow} var(--gh-duration-pulse) var(--gh-easing-in-out) infinite;
  @media (prefers-reduced-motion: reduce) { animation: none; text-shadow: 0 0 var(--gh-size-0_5) currentColor; }
`;

/** Preserve the localized clock text and animate only its minute prime. */
export function MatchClockText({ text }: { text: string }) {
  const marker = text.indexOf("′");
  return marker < 0 ? text : <>{text.slice(0, marker)}<MinuteMarker data-minute-marker>′</MinuteMarker>{text.slice(marker + 1)}</>;
}
