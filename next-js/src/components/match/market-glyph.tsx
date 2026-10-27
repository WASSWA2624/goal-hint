"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import type { MarketFamily } from "@/domain/markets";

/** A market family's square icon, or a locked or missing pick. */
export type MarketGlyphKind = MarketFamily | "locked" | "none";

/** A market ground and its contrasting marks follow the active theme together. */
const Svg = styled.svg<{ $kind: MarketGlyphKind }>`
  display: block;
  flex: none;
  inline-size: var(--gh-glyph-size, 2rem);
  block-size: var(--gh-glyph-size, 2rem);
  [data-ground] {
    fill: ${({ theme, $kind }) => $kind === "locked" ? theme.color.mutedText : $kind === "none" ? theme.color.surface : theme.color.market[$kind].solid};
    stroke: ${({ theme, $kind }) => $kind === "none" ? theme.color.border : "none"};
  }
  [data-ink] { fill: none; stroke: ${({ theme, $kind }) => $kind === "none" ? theme.color.mutedText : theme.color.onBrand}; stroke-linecap: round; stroke-linejoin: round; }
  [data-ink-fill] { fill: ${({ theme }) => theme.color.onBrand}; }
`;

const marks: Readonly<Record<MarketGlyphKind, ReactNode>> = {
  "match-result": <>
    <path data-ink d="M10 23V11.5M16 23v-6M22 23v-8.5" strokeWidth="3.5" />
    <path data-ink d="M6.5 27h19" strokeWidth="1.5" opacity="0.75" />
  </>,
  "double-chance": <>
    <circle data-ink cx="12.5" cy="16" r="6.5" strokeWidth="2" />
    <circle data-ink cx="19.5" cy="16" r="6.5" strokeWidth="2" />
  </>,
  "total-goals": <>
    <circle data-ink cx="14" cy="18" r="7.5" strokeWidth="2" />
    <path data-ink-fill d="M14 14.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" />
    <path data-ink d="M24 5.5v7M20.5 9h7" strokeWidth="2.2" />
  </>,
  "both-teams-to-score": <>
    <path data-ink d="M5 22V11h9v11M18 22V11h9v11" strokeWidth="2" />
    <path data-ink d="M5 15h9M18 15h9" strokeWidth="1" opacity="0.6" />
    <circle data-ink-fill cx="9.5" cy="19" r="1.9" />
    <circle data-ink-fill cx="22.5" cy="19" r="1.9" />
    <path data-ink d="M3.5 23.5h25" strokeWidth="1.5" opacity="0.75" />
  </>,
  locked: <>
    <rect data-ink x="10" y="15" width="12" height="9" rx="1.5" strokeWidth="2" />
    <path data-ink d="M12.5 15v-3a3.5 3.5 0 0 1 7 0v3M16 18.5v2" strokeWidth="2" />
  </>,
  none: <>
    <circle data-ink cx="16" cy="16" r="7.5" strokeWidth="2" />
    <path data-ink d="M16 12v4.5l3 1.8" strokeWidth="2" />
  </>,
};

export function MarketGlyph({ kind, className }: { kind: MarketGlyphKind; className?: string }) {
  return <Svg className={className} $kind={kind} viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-market-glyph={kind}>
    {kind === "none" ? <rect data-ground x="0.5" y="0.5" width="31" height="31" rx="2" /> : <rect data-ground width="32" height="32" rx="2" />}
    {marks[kind]}
  </Svg>;
}
