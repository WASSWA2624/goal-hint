"use client";

import styled from "styled-components";
import { AlertIcon, ChipIcon, InfoIcon, PlugIcon, SparklesIcon } from "@/components/ui/icons";
import { featuredPriceValue, type FeaturedPrediction } from "@/domain/extended-markets";
import type { MarketSource } from "@/domain/markets";
import type { Messages } from "@/i18n/messages";

const Source = styled.small`
  display: inline-flex; flex: none; align-items: center;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-micro);
  font-weight: ${({ theme }) => theme.typography.weight.body};
  line-height: var(--gh-leading-label);
  > svg { inline-size: var(--gh-size-3); block-size: var(--gh-size-3); }
`;
const Status = styled(Source)`
  &[data-featured-tier="priced-fallback"] { color: ${({ theme }) => theme.color.accent.amber.text}; }
`;
const Value = styled.small`
  color: ${({ theme }) => theme.color.outcome.correct.text};
  font-size: var(--gh-font-micro);
  font-weight: ${({ theme }) => theme.typography.weight.body};
`;
const FeaturedValue = styled(Value)`
  margin-inline-start: var(--gh-size-1);
  line-height: 0;
  vertical-align: super;
`;

const sourceIcons = { "local-engine": ChipIcon, "api-football": PlugIcon, ai: SparklesIcon } satisfies Record<MarketSource, typeof ChipIcon>;

export function ForecastSourceLabel({ source, messages, label }: {
  source: MarketSource; messages: Messages; label?: string | undefined;
}) {
  const name = label ?? messages.text(`market.source.${source}`);
  const Icon = sourceIcons[source];
  return <Source data-forecast-source={source} title={name} role="img" aria-label={name}><Icon /></Source>;
}

const forecastOnlyReasons = {
  "odds-not-permitted": "market.featuredStatus.oddsNotPermitted", "no-verified-odds": "market.featuredStatus.noVerifiedOdds",
  "no-comparable-quote": "market.featuredStatus.noComparableQuote", "no-qualifying-outcome": "market.featuredStatus.noQualifyingOutcome",
} as const;

export function featuredPickStatusText(pick: FeaturedPrediction | null | undefined, messages: Messages): string | null {
  if (pick?.tier === "priced-fallback") {
    const expected = Number(pick.featuredExpectedNetReturn);
    return [messages.text("market.featuredStatus.pricedFallback"), messages.text(expected < 0 ? "market.featuredStatus.belowBreakEven"
      : expected === 0 ? "market.featuredStatus.atBreakEven" : "market.featuredStatus.belowStandardPrice")].join(" · ");
  }
  if (pick?.tier === "forecast-only") return [messages.text("market.featuredStatus.forecastOnly"),
    pick.forecastOnlyReason ? messages.text(forecastOnlyReasons[pick.forecastOnlyReason]) : null].filter(Boolean).join(" · ");
  return null;
}

export function FeaturedPickStatus({ pick, description, compact = false }: {
  pick: FeaturedPrediction | null | undefined; description: string | null; compact?: boolean;
}) {
  if (!description) return null;
  const Icon = pick?.tier === "priced-fallback" ? AlertIcon : InfoIcon;
  return <Status data-featured-tier={pick?.tier} title={description} {...(compact ? { role: "img", "aria-label": description } : {})}>
    {compact ? <Icon /> : description}
  </Status>;
}

export function ForecastValueLabel({ expectedReturn, messages }: { expectedReturn: number | null; messages: Messages }) {
  if (expectedReturn === null || expectedReturn <= 0) return null;
  const description = messages.text("market.expectedReturn", {
    return: messages.number(expectedReturn, { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }),
  });
  return <Value data-positive-value title={description} aria-label={description}>{messages.text("market.positiveValue")}</Value>;
}

export function featuredPriceValueText(pick: FeaturedPrediction | null | undefined, price: string | null | undefined, messages: Messages) {
  const value = featuredPriceValue(pick, price);
  return value === null ? null : messages.text("market.expectedReturn", {
    return: messages.number(Number(value), { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }),
  });
}

export function FeaturedPriceValue({ description, messages }: { description: string | null; messages: Messages }) {
  return description && <FeaturedValue as="sup" role="img" data-positive-value title={description} aria-label={description}>
    {messages.text("market.positiveValue")}
  </FeaturedValue>;
}
