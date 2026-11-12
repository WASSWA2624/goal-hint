"use client";

import { FilterDialogContent, FilterDialogSection, FilterFieldRow, FilterSection } from "@/components/ui/advanced-filter-dialog";
import { MutedText } from "@/components/ui/layout";
import { MarketFilterChoice } from "@/components/ui/market-filter-dialog";
import { feedMarketPickOptions } from "@/domain/feed-market-picks";
import { isAnyMarkets, type FeedQuery } from "@/domain/feed-query";
import type { MarketFilterMatches } from "@/domain/market-filter-search";
import { publicPolicy } from "@/domain/public-policy";
import type { Messages } from "@/i18n/messages";

export type FeedMarketDraft = Pick<FeedQuery, "markets" | "marketPicks">;

function pickLabel(messages: Messages, option: typeof feedMarketPickOptions[number]) {
  return option.kind === "legacy" ? messages.text(`market.selection.${option.selection}`)
    : messages.text(`market.selection.${option.selection}`, { line: "1.5" });
}

export function feedMarketLabels(messages: Messages, value: FeedMarketDraft) {
  const families = isAnyMarkets(value.markets) ? [] : publicPolicy.markets.filter(family => value.markets.includes(family))
    .map(family => messages.text(`market.family.${family}`));
  const outcomes = feedMarketPickOptions.filter(option => value.marketPicks?.includes(option.id)).map(option => pickLabel(messages, option));
  return [...families, ...outcomes];
}

export function FeedMarketFields({ value, locked, messages, matches, onChange }: {
  value: FeedMarketDraft; locked: boolean; messages: Messages; matches: MarketFilterMatches | null; onChange: (value: FeedMarketDraft) => void;
}) {
  const picks = value.marketPicks ?? [];
  const allMarkets = isAnyMarkets(value.markets);
  return <FilterDialogContent>
    <FilterDialogSection hidden={matches?.families.size === 0}><FilterSection>
      <legend>{messages.text("feed.filters.marketFamilies")}</legend>
      <MarketFilterChoice hidden={matches !== null}><input type="checkbox" checked={allMarkets && picks.length === 0}
        onChange={() => onChange({ markets: [...publicPolicy.markets] })} />{messages.text("feed.filters.any")}</MarketFilterChoice>
      <FilterFieldRow data-market-choices>
        {publicPolicy.markets.map(family => {
          const selected = value.markets.includes(family), last = selected && value.markets.length === 1;
          return <MarketFilterChoice key={family} hidden={matches !== null && !matches.families.has(family)}>
            {last && <input type="hidden" name="market" value={family} />}
            <input type="checkbox" name="market" value={family} checked={selected} disabled={last}
              title={last ? messages.text("feed.filters.oneMarket") : undefined}
              onChange={() => onChange({ ...value, markets: selected ? value.markets.filter(market => market !== family) : [...value.markets, family] })} />
            {messages.text(`market.family.${family}`)}
          </MarketFilterChoice>;
        })}
      </FilterFieldRow>
    </FilterSection></FilterDialogSection>
    <FilterDialogSection hidden={matches?.outcomes.size === 0}><FilterSection disabled={locked}>
      <legend>{messages.text("feed.filters.publishedOutcomes")}</legend>
      <MutedText>{messages.text(locked ? "feed.filters.publishedOutcomesLocked" : "feed.filters.publishedOutcomesHelp")}</MutedText>
      <FilterDialogContent data-published-market-picks>
        {publicPolicy.markets.map(family => <FilterDialogSection key={family} hidden={matches !== null && !matches.outcomes.has(family)}><FilterSection>
          <legend>{messages.text(family === "total-goals" ? "slips.totalGoalsMarket" : `market.family.${family}`)}</legend>
          <FilterFieldRow>
            {feedMarketPickOptions.filter(option => option.family === family).map(option => {
              const selected = picks.includes(option.id);
              const outcome = option.kind === "legacy" ? option.selection : `${option.selection}-1.5` as const;
              return <MarketFilterChoice key={option.id} hidden={matches !== null && !matches.outcomes.get(family)?.has(outcome)}>
                <input type="checkbox" name="marketPick" value={option.id} checked={selected}
                  onChange={() => onChange({ ...value, marketPicks: selected ? picks.filter(pick => pick !== option.id) : [...picks, option.id] })} />
                {pickLabel(messages, option)}
              </MarketFilterChoice>;
            })}
          </FilterFieldRow>
        </FilterSection></FilterDialogSection>)}
      </FilterDialogContent>
    </FilterSection></FilterDialogSection>
  </FilterDialogContent>;
}
