"use client";

import styled from "styled-components";
import type { ComponentPropsWithoutRef } from "react";
import type { MarketFamily } from "@/domain/markets";
import type { OutcomeTone } from "@/styles/theme";

const OddsValue = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
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
  min-inline-size: 12px;
  block-size: 6px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: 0;
  overflow: hidden;
  > span { display: block; block-size: 100%; background: ${({ theme, $family }) => theme.color.market[$family].solid}; }
`;

/** Shared square outcome styling keeps valid result labels prominent in every match presentation. */
export const OutcomeBadge = styled.span<{ $outcome: OutcomeTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 3px 6px;
  color: ${({ theme, $outcome }) => theme.color.outcome[$outcome].text};
  background: ${({ theme, $outcome }) => theme.color.outcome[$outcome].background};
  border: ${({ theme }) => theme.border.width} solid ${({ theme, $outcome }) => theme.color.outcome[$outcome].border};
  border-radius: 0;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 1.2;
  > svg { display: block; flex: none; font-size: 0.8125rem; }
`;
