import { LOCAL_FIRST_MARKET_REGISTRY_VERSION, reconcileOddsCatalog } from "./market-registry.ts";
import { registeredForecastGoalMarkets } from "./goal-market-definitions.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey } from "./legacy-goal-market-identities.ts";
import { isMarketFamily } from "./markets.ts";
import {
  inspectLocalFeaturedQuote, localFeaturedQuoteScopeReason, modeledFeaturedReturn, representedSettlement, verifiedLocalFeaturedBinding,
  type FeaturedDecisionInput,
} from "./local-featured-decision.ts";

export const localFeaturedCoverageVersion = "local-featured-coverage-v1";
const marketDefinitions = new Map(registeredForecastGoalMarkets(true).map((market) => [market.definition.key, market]));
const keyOf = (...fields: (string | number)[]) => fields.join("\0");
type Binding = NonNullable<ReturnType<typeof verifiedLocalFeaturedBinding>>;
type RegisteredOutcome = Readonly<{ marketKey: string; selection: string; family: NonNullable<ReturnType<typeof marketDefinitions.get>>["family"];
  period: NonNullable<ReturnType<typeof marketDefinitions.get>>["definition"]["period"]; terms: "binary" | "asian" }>;

function registeredOutcome(marketKey: string, selection: string): RegisteredOutcome | null {
  const canonicalSelection = isMarketFamily(marketKey) ? canonicalLegacyForecastSelection(marketKey, selection) : selection;
  const canonicalKey = isMarketFamily(marketKey) ? legacyForecastMarketKey(marketKey) : marketKey;
  const market = marketDefinitions.get(canonicalKey);
  if (!market || canonicalSelection === null || !market.definition.selections.some(({ key }) => key === canonicalSelection)) return null;
  return { marketKey: canonicalKey, selection: canonicalSelection, family: market.family, period: market.definition.period,
    terms: market.definition.group === "payout" ? "asian" : "binary" };
}

const bindingKey = ({ betId, betName, label }: Binding) => keyOf(betId, betName, label);
const registeredBindings = new Map<string, RegisteredOutcome>();
for (const [marketKey, { definition }] of marketDefinitions) {
  for (const { key: selection } of definition.selections) {
    const binding = verifiedLocalFeaturedBinding(marketKey, selection);
    const outcome = binding ? registeredOutcome(marketKey, selection) : null;
    if (binding && outcome?.terms === binding.terms) registeredBindings.set(bindingKey(binding), outcome);
  }
}

/** Compare independently validated forecasts with the retained offer inventory by exact selection.
 * Catalog mappings alone never establish an eligible quote, model, or payout. */
export function auditLocalFeaturedCoverage(input: FeaturedDecisionInput, includeDetails = true) {
  const counts: Record<string, number> = {
    modeledMarketGroups: 0, modeledOutcomes: 0, validModeledOutcomes: 0, invalidModeledOutcomes: 0,
    modeledWithEligibleExactQuote: 0, modeledWithNoExactQuote: 0, modeledWithIneligibleExactQuote: 0, modeledWithoutVerifiedBinding: 0,
    mappedModelsWithoutObservableQuoteScope: 0,
    bookmakerBooks: 0, bookmakerMarketGroups: 0, bookmakerPriceRows: 0, distinctOfferedGroups: 0,
    distinctOfferedGroupsWithReviewedMapping: 0, distinctOfferedGroupsWithoutReviewedMapping: 0,
    boundEligiblePriceRowsWithModel: 0, boundEligiblePriceRowsWithoutModel: 0, boundIneligiblePriceRows: 0, unboundPriceRows: 0,
    boundEligibleExactOutcomesWithModel: 0, boundEligibleExactOutcomesWithoutModel: 0,
  };
  const increment = (name: string) => { counts[name] = (counts[name] ?? 0) + 1; };
  const scopeReason = localFeaturedQuoteScopeReason(input);
  if (scopeReason) increment(`quoteScope:${scopeReason}`);
  const modelKeys = new Set<string>();
  const marketKeys = new Set<string>();
  const models = input.outcomes.flatMap(({ marketKey, selection, settlementProbabilities, unrepresentedProbability }) => {
    const registration = registeredOutcome(marketKey, selection);
    const identity = registration ?? { marketKey, selection };
    const key = keyOf(identity.marketKey, identity.selection);
    if (modelKeys.has(key)) return [];
    modelKeys.add(key);
    marketKeys.add(identity.marketKey);
    const valid = registration !== null && representedSettlement(settlementProbabilities, registration.terms, unrepresentedProbability) !== null;
    const binding = valid ? verifiedLocalFeaturedBinding(marketKey, selection) : null;
    return [{ key, identity, valid, settlementProbabilities, unrepresentedProbability,
      binding: binding && registeredBindings.has(bindingKey(binding)) ? binding : null }];
  });
  const validModels = new Map(models.filter(({ valid }) => valid).map((model) => [model.key, model]));
  counts.modeledMarketGroups = marketKeys.size;
  counts.modeledOutcomes = modelKeys.size;
  counts.validModeledOutcomes = validModels.size;
  counts.invalidModeledOutcomes = modelKeys.size - validModels.size;

  const groupScopes = new Set<string>(), groups = new Map<string, ReturnType<typeof reconcileOddsCatalog>[number]>();
  const offered = new Set<string>(), eligible = new Set<string>(), eligibleWithModel = new Set<string>(), eligibleWithoutModel = new Set<string>();
  // When the rights check fails, this diagnostic exposes only modeled capabilities.
  const books = input.quotesPermitted ? input.quotes?.bookmakers ?? [] : [];
  counts.bookmakerBooks = new Set(books.map(({ bookmakerId }) => bookmakerId)).size;
  const quoted = books.flatMap((book) => {
    const groupCounts = new Map<string, number>();
    for (const { betId, betName } of book.offers) {
      const key = keyOf(betId, betName);
      groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    }
    return book.offers.flatMap((offer) => {
      const { betId, betName } = offer;
      const groupKey = keyOf(betId, betName);
      groupScopes.add(keyOf(book.bookmakerId, groupKey));
      let group = groups.get(groupKey);
      if (!group) {
        group = reconcileOddsCatalog("pre-match", [{ id: betId, name: betName }])[0]!;
        groups.set(groupKey, group);
      }
      const labelCounts = new Map<string, number>();
      for (const { label } of offer.values) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      return offer.values.map((value) => {
        const { label } = value;
        const quoteKey = keyOf(betId, betName, label);
        const binding = registeredBindings.get(quoteKey) ?? null;
        const base = { bookmakerId: book.bookmakerId, betId, betName, label, binding };
        increment("bookmakerPriceRows");
        if (!binding) {
          const reason = group.reason ?? "provider-selection-without-verified-binding";
          increment("unboundPriceRows");
          increment(`priceReason:${reason}`);
          return { ...base, status: "unbound" as const, reason };
        }
        offered.add(quoteKey);
        const duplicate = groupCounts.get(groupKey) !== 1 ? "duplicate-bookmaker-market"
          : labelCounts.get(label) !== 1 ? "duplicate-provider-selection" : null;
        const result = scopeReason || duplicate ? { reason: scopeReason ?? duplicate! } : inspectLocalFeaturedQuote(book, offer, value, input.decisionAt);
        if ("reason" in result) {
          increment("boundIneligiblePriceRows");
          increment(`priceReason:${result.reason}`);
          return { ...base, status: "ineligible" as const, reason: result.reason };
        }
        eligible.add(quoteKey);
        const model = validModels.get(keyOf(binding.marketKey, binding.selection));
        if (!model) {
          eligibleWithoutModel.add(quoteKey);
          increment("boundEligiblePriceRowsWithoutModel");
          return { ...base, status: "eligible-without-model" as const, quote: result.quote };
        }
        eligibleWithModel.add(quoteKey);
        increment("boundEligiblePriceRowsWithModel");
        return { ...base, status: "eligible-with-model" as const, quote: result.quote,
          modeledWinProbability: model.settlementProbabilities.win,
          expectedNetReturn: includeDetails
            ? modeledFeaturedReturn(model.settlementProbabilities, result.price, binding.terms, model.unrepresentedProbability) : null };
      });
    });
  });

  counts.bookmakerMarketGroups = groupScopes.size;
  counts.distinctOfferedGroups = groups.size;
  const mappedGroups = [...groups.values()].filter(({ status }) => status === "mapped").length;
  counts.distinctOfferedGroupsWithReviewedMapping = mappedGroups;
  counts.distinctOfferedGroupsWithoutReviewedMapping = groups.size - mappedGroups;
  counts.boundEligibleExactOutcomesWithModel = eligibleWithModel.size;
  counts.boundEligibleExactOutcomesWithoutModel = eligibleWithoutModel.size;
  const modeled = models.map(({ identity, valid, binding, settlementProbabilities }) => {
    const model = { ...identity, probability: Number.isFinite(settlementProbabilities.win) ? settlementProbabilities.win : null };
    if (!valid) {
      const reason = "terms" in identity ? "incomplete-settlement-probabilities" as const : "unregistered-market-outcome" as const;
      increment(`modelReason:${reason}`);
      return { ...model, status: "invalid-model" as const, reason };
    }
    if (!binding) {
      increment("modeledWithoutVerifiedBinding");
      return { ...model, status: "unmapped" as const, reason: "no-verified-price-binding" as const };
    }
    const key = bindingKey(binding);
    if (eligible.has(key)) {
      increment("modeledWithEligibleExactQuote");
      return { ...model, status: "eligible-exact-quote" as const, binding };
    }
    if (scopeReason) increment("mappedModelsWithoutObservableQuoteScope");
    const hasOffer = offered.has(key);
    increment(hasOffer ? "modeledWithIneligibleExactQuote" : "modeledWithNoExactQuote");
    return { ...model, status: hasOffer ? "ineligible-exact-quote" as const : "no-exact-quote" as const,
      reason: scopeReason ?? (hasOffer ? "no-eligible-price" as const : "no-exact-quote-in-stored-inventory" as const), binding };
  });
  return { version: localFeaturedCoverageVersion, registryVersion: LOCAL_FIRST_MARKET_REGISTRY_VERSION, counts,
    modeled: includeDetails ? modeled : [], quoted: includeDetails ? quoted : [], groups: includeDetails ? [...groups.values()] : [] };
}
