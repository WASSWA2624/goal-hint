import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOddsCatalog } from "../src/domain/market-registry.ts";
import { resolveReferenceOdds } from "../src/domain/reference-odds.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { inPlayReferencePrice } from "../src/server/odds/in-play-odds-read.ts";
import { oddsValuesHash } from "../src/server/odds/odds-mysql-store.ts";
import { createRecommendationQuoteLoader } from "../src/server/odds/recommendation-quotes.ts";
import { evidenceContext, evidenceHash } from "./helpers/evidence-fixtures.mjs";

const fixtureId = "00000000-0000-4000-8000-000000000001";
const under = { fixtureId, phase: "pre-match", period: "full-time", marketId: 5, marketName: "Goals Over/Under",
  label: "Under 2.5", line: "2.50", playerId: null, teamId: null };
const at = 1_000_000, policy = { asOf: at, freshnessMs: 100_000, preferredBookmakerId: 8, fallbackBookmakerIds: [12, 3] };
const offer = (bookmakerId, recent = 1000, patch = {}) => ({ ...under, bookmakerId, sourceId: `api-football:bookmaker:${bookmakerId}`,
  price: "1.87", observedAt: at - recent, checkedAt: at - recent, providerUpdatedAt: null, state: "open", ...patch });

test("catalog reconciliation accounts for all rows and separates namespaces, mismatches, duplicates and unsupported definitions", () => {
  const extra = { namespace: "pre-match", id: 300, name: "Synthetic scoring in both halves", family: "scoring-in-both-halves", period: "full-time" };
  const listed = reconcileOddsCatalog("pre-match", [
    { id: 1, name: "Match Winner" }, { id: 6, name: "Goals Over/Under First Half" },
    { id: 8, name: "Different Name" }, { id: 299, name: null },
    { id: 300, name: extra.name }, { id: 301, name: "Unreviewed" },
    { id: 302, name: "Repeated" }, { id: 302, name: "Other" },
  ], [extra]);
  assert.deepEqual(listed.map(({ status }) => status), ["mapped", "mapped", "unmapped", "unmapped", "unsupported", "unmapped", "unmapped", "unmapped"]);
  assert.equal(listed[1].mappings[0].period, "half-time");
  assert.equal(listed[2].reason, "provider-name-mismatch");
  assert.equal(listed[3].reason, "provider-name-unavailable");
  assert.equal(listed[4].reason, "settlement-rule-unavailable");
  assert.equal(listed[6].reason, "duplicate-provider-id");
  const live = reconcileOddsCatalog("in-play", [{ id: 1, name: "Match Winner" }, { id: 36, name: "Over/Under Line" }]);
  assert.deepEqual(live.map(({ status }) => status), ["unmapped", "mapped"]);
});

test("reference odds follow preferred, ordered fallback, freshest and strict requested-bookmaker behavior", () => {
  const offers = [offer(3, 1), offer(12, 50_000), offer(8, 90_000)];
  assert.equal(resolveReferenceOdds(under, offers, policy).actualBookmakerId, 8);
  const fallback = resolveReferenceOdds(under, offers.slice(0, 2), policy);
  assert.equal(fallback.actualBookmakerId, 12);
  assert.equal(fallback.fallback, "configured");
  assert.equal(fallback.requestedBookmakerId, null);
  const freshest = resolveReferenceOdds(under, [offer(12), offer(3)], { ...policy, fallbackBookmakerIds: [] });
  assert.equal(freshest.actualBookmakerId, 3);
  assert.equal(freshest.fallback, "freshest");
  const requested = resolveReferenceOdds(under, offers, { ...policy, requestedBookmakerId: 3 });
  assert.equal(requested.actualBookmakerId, 3);
  assert.equal(requested.requestedBookmakerId, 3);
  assert.equal(requested.fallback, "none");
  assert.equal(resolveReferenceOdds(under, offers, { ...policy, requestedBookmakerId: 2 }).reason, "requested-bookmaker-unavailable");
});

test("exact phase, period, line, player and team cannot borrow prices, and suspension masks the older observation", () => {
  const nonExact = [offer(1, 1, { phase: "in-play" }), offer(2, 1, { period: "half-time" }), offer(3, 1, { line: "3.5" }),
    offer(4, 1, { playerId: 78 }), offer(5, 1, { teamId: 35 }), offer(6, 1, { marketName: "Old name" }),
    offer(7, 1, { price: "invalid" })];
  assert.equal(resolveReferenceOdds(under, nonExact, policy).state, "unavailable");
  const suspended = resolveReferenceOdds(under, [offer(8, 1000), offer(8, 1, { state: "suspended", price: null })], policy);
  assert.equal(suspended.reason, "suspended");
  assert.equal(suspended.lastObservation.checkedAt, at - 1);
  const stale = resolveReferenceOdds(under, [offer(8, 1, { providerUpdatedAt: at - policy.freshnessMs - 1 })], policy);
  assert.equal(stale.reason, "stale");
  assert.equal(stale.lastObservation.providerUpdatedAt, at - policy.freshnessMs - 1);
  assert.equal(resolveReferenceOdds(under, [offer(3, 1, { line: "2.5" })], policy).actualBookmakerId, 3);
  assert.equal(resolveReferenceOdds(under, [offer(8, 1), offer(8, 1, { price: "1.99" })], policy).state, "unavailable");
});

test("the live source remains unbound and uses only reviewed market periods", () => {
  const target = { ...under, phase: "in-play", marketId: 36, marketName: "Over/Under Line", label: "Under" };
  const current = { fixtureId, kickoffAt: at - 60_000, checkedAt: at - 1000, providerUpdatedAt: null,
    prices: { state: "available", markets: [], providerMarkets: [{ betId: 36, name: "Over/Under Line",
      selections: [{ label: "Under", line: "2.5", price: "1.9" }, { label: "Under", line: "1.5", price: "2.8" }] }] } };
  const selected = inPlayReferencePrice(current, target, at);
  assert.equal(selected.actualBookmakerId, null);
  assert.equal(selected.sourceId, "api-football-live");
  assert.equal(selected.offer.price, "1.9");
  assert.equal(inPlayReferencePrice(current, target, at, { requestedBookmakerId: 8 }).reason, "requested-bookmaker-unavailable");
  assert.equal(inPlayReferencePrice(current, { ...target, period: "half-time" }, at).state, "unavailable");
});

test("the protected recommendation loader uses the exact authorized fallback with its sealed receipt", async () => {
  const context = evidenceContext(), observedAt = context.cutoffAt - 1000;
  const snapshot = (bookmakerId, home) => {
    const values = [{ label: "Home", odd: home }, { label: "Draw", odd: "3.4" }, { label: "Away", odd: "3.6" }];
    const identity = { fixtureId: context.fixtureId, previousId: null, bookmakerId, bookmakerName: null, betId: 1,
      betName: "Match Winner", valuesHash: oddsValuesHash(values) };
    return { ...identity, id: evidenceFingerprint(identity), retrievedAt: observedAt, providerUpdatedAt: null,
      retainUntil: context.kickoffAt + 3_600_000, values };
  };
  const fallback = snapshot(12, "2.1"), other = snapshot(3, "2.15");
  const manifest = ({ bookmakerId, betId, betName, valuesHash }) =>
    ({ bookmakerId, kickoffAt: context.kickoffAt, bets: [{ betId, betName, valuesHash }] });
  const policyHash = evidenceHash("preferred-policy"), receiptId = evidenceHash("price-receipt");
  const receipt = { id: receiptId, accountId: evidenceHash("account"), kind: "prices", scopeKey: "date:prices", policyHash,
    status: "complete", requestsDispatched: 1, receivedAt: observedAt, requestId: evidenceHash("request"), slot: observedAt,
    date: null, contractVersion: "synthetic", reasons: [], missingCoverage: [], pages: [], catalog: [],
    fixtures: [{ externalId: context.externalFixtureId, observationHash: evidenceHash("fixture-obs"), outcome: "apply",
      quoteManifest: { bookmakerId: 8, kickoffAt: context.kickoffAt, bets: [] },
      additionalQuoteManifests: [manifest(fallback), manifest(other)] }],
  };
  const catalogue = { ...receipt, kind: "bets", fixtures: [], catalog: [{ id: 1, name: "Match Winner" }] };
  const sealed = (body) => ({ body, validIntegrity: 1 });
  const results = [[sealed(receipt)], [sealed(catalogue)], [sealed(other), sealed(fallback)]];
  const read = createRecommendationQuoteLoader({ query: (operation) => operation({
    footballFixture: { async findUnique() { return { provider: context.provider, externalId: BigInt(context.externalFixtureId),
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, kickoff: new Date(context.kickoffAt), dataVersion: context.fixtureVersion }; } },
    fixtureOddsState: { async findUnique() { return { policyHash, withdrawnAt: null, lastRetrievedAt: new Date(observedAt), latestBatchId: receiptId }; } },
    $queryRaw: async () => results.shift(),
  }) }, { bookmakerId: 8, fallbackBookmakerIds: [12, 3], expectedPolicyHash: policyHash, freshnessMs: 20_000, verifyInternalUse: () => true });
  const quotes = await read(context);
  assert.equal(quotes.length, 3);
  assert.ok(quotes.every((quote) => quote.bookmakerId === 12 && quote.observationReceiptId === receiptId && quote.observedAt === observedAt));
  assert.equal(quotes.find(({ selection }) => selection === "home-win").decimal, "2.1");
  assert.equal(Object.hasOwn(quotes[0], "impliedProbability"), false);
});
