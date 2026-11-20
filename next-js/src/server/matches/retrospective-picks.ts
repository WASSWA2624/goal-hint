import "server-only";

import { createMessages } from "../../i18n/messages.ts";
import { total15MarketKey } from "../../domain/extended-markets.ts";
import { feedMarketPickOptions, type FeedMarketPick } from "../../domain/feed-market-picks.ts";
import type { StoredFixtureSnapshot } from "../../domain/fixture-snapshot.ts";
import { featuredPrediction } from "../../domain/market-ranking.ts";
import { predictionText } from "../../domain/prediction-label.ts";
import type { NovemberReplayProjection } from "../intelligence/november-replay-store.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey, legacyForecastOutcome } from "../predictions/forecast-market-evaluator.ts";

export function retrospectiveOutcomeKeys(picks: readonly FeedMarketPick[]) {
  return feedMarketPickOptions.filter(({ id }) => picks.includes(id)).flatMap<{ marketKey: string; selection: string }>((option) => {
    if (option.kind === "extended") return [{ marketKey: total15MarketKey, selection: option.selection }];
    const selection = canonicalLegacyForecastSelection(option.family, option.selection);
    return selection ? [{ marketKey: legacyForecastMarketKey(option.family), selection }] : [];
  });
}

/** Public replay picks preserve the decision's own identity, probability and original forecast reference. */
export function projectRetrospectiveForecast(fixture: StoredFixtureSnapshot, replay: NovemberReplayProjection | undefined,
  locale: string, exact: ReturnType<typeof retrospectiveOutcomeKeys> = []) {
  if (!replay || fixture.fixtureId !== replay.fixtureId || fixture.cycleId !== replay.cycleId ||
      fixture.kickoffAt !== replay.kickoffAt || fixture.forecast?.revisionId !== replay.sourceRevisionId) return null;
  const messages = createMessages(locale);
  const entries = replay.markets.flatMap(({ definition, selected }) => {
    const choice = definition.selections.find(({ key }) => key === selected.selection);
    if (!choice) return [];
    const legacy = legacyForecastOutcome(definition.key, selected.selection);
    const key = legacy?.family ?? definition.key;
    const pick = {
      key, family: legacy?.family ?? "total-goals" as const,
      label: legacy ? messages.text(`market.family.${legacy.family}`) : definition.label,
      code: legacy ? null : definition.code, selection: legacy?.selection ?? choice.key,
      selectionLabel: predictionText(messages, legacy?.selection ?? choice.key, { marketKey: definition.key, rule: choice.rule, label: choice.label }),
      source: "local-engine" as const, probability: selected.probability, odds: null,
    };
    return [{ marketKey: definition.key, selection: selected.selection, pick }];
  });
  const eligible = exact.length ? entries.filter((entry) => exact.some(({ marketKey, selection }) =>
    marketKey === entry.marketKey && selection === entry.selection)) : entries;
  const pick = eligible.find(({ marketKey, selection }) => replay.selected.marketKey === marketKey && replay.selected.selection === selection)?.pick ??
    (exact.length ? featuredPrediction(eligible.map(({ marketKey, selection, pick }) =>
      ({ key: marketKey, selection, probability: pick.probability, odds: pick.odds, pick })))?.pick : null);
  if (!pick) return null;
  return { card: { revisionId: replay.revisionId, sourceRevisionId: replay.sourceRevisionId,
    evidenceCutoffAt: replay.evidenceCutoffAt, generatedAt: replay.generatedAt, activatedAt: replay.activatedAt, pick },
    markets: entries.map((entry) => entry.pick) };
}
