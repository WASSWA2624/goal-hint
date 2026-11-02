"use client";

import styled from "styled-components";
import type { ComponentPropsWithoutRef } from "react";
import type { MarketFamily } from "@/domain/markets";
import type { OutcomeTone } from "@/styles/theme";
export { PredictionOutcome } from "./prediction-outcome";

const OddsValue = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

/** The caller supplies its own selected price; absent prices add no text or brackets. */
export type PredictionOddsProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & { odds?: string | null | undefined };
export function PredictionOdds({ odds, ...props }: PredictionOddsProps) {
  return odds ? <>{" "}<OddsValue {...props} data-pick-odds="" data-selected-odds="">({odds})</OddsValue></> : null;
}

/** A decorative meter; the caller supplies the fill width and the accessible probability label. */
export const ProbabilityBar = styled.span<{ $family: MarketFamily }>`
  display: block;
  flex: 1;
  min-inline-size: var(--gh-size-3);
  block-size: var(--gh-size-1_5);
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: ${({ theme }) => theme.radius.small};
  overflow: hidden;
  > span { display: block; block-size: 100%; background: ${({ theme, $family }) => theme.color.market[$family].solid}; }
`;

/** Shared outcome styling keeps valid result labels prominent in every match presentation. */
export const OutcomeBadge = styled.span<{ $outcome: OutcomeTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--gh-spacing-1);
  padding: var(--gh-spacing-0_75) var(--gh-spacing-1_5);
  color: ${({ theme, $outcome }) => theme.color.outcome[$outcome].text};
  background: ${({ theme, $outcome }) => theme.color.outcome[$outcome].background};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.small};
  font-size: var(--gh-font-body);
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: var(--gh-leading-control);
  > svg { display: block; flex: none; font-size: var(--gh-font-body); }
`;
