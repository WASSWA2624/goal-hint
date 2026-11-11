"use client";

import styled from "styled-components";
import type { MarketSource } from "@/domain/markets";
import type { Messages } from "@/i18n/messages";

const Source = styled.small`
  display: block;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-micro);
  font-weight: ${({ theme }) => theme.typography.weight.body};
  line-height: var(--gh-leading-label);
`;
const Value = styled.small`
  color: ${({ theme }) => theme.color.outcome.correct.text};
  font-size: var(--gh-font-micro);
  font-weight: ${({ theme }) => theme.typography.weight.body};
`;

export function ForecastSourceLabel({ source, messages }: { source: MarketSource; messages: Messages }) {
  return <Source data-forecast-source={source}>{messages.text(`market.source.short.${source}`)}</Source>;
}

export function ForecastValueLabel({ expectedReturn, messages }: { expectedReturn: number | null; messages: Messages }) {
  if (expectedReturn === null || expectedReturn <= 0) return null;
  const description = messages.text("market.expectedReturn", {
    return: messages.number(expectedReturn, { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }),
  });
  return <Value data-positive-value title={description} aria-label={description}>{messages.text("market.positiveValue")}</Value>;
}
