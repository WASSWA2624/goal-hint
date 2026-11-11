import assert from "node:assert/strict";
import test from "node:test";
import { bookmakerMarketPrice } from "../src/domain/bookmaker-odds.ts";
import { mergeLiveDetail } from "../src/domain/live-refresh.ts";
import { matchDetailResponseSchema } from "../src/domain/match-detail.ts";
import { gateDetailResponse } from "../src/domain/paywall.ts";
import { projectBookmakerOdds } from "../src/server/odds/bookmaker-odds-read.ts";
import { mapInPlayOdds, reviewedInPlayCatalog } from "../src/server/odds/in-play-odds-mapping.ts";
import { oddsValuesHash, storedCurrentBookmakerQuotes } from "../src/server/odds/odds-mysql-store.ts";
import { liveDetail, liveRecord, now } from "./helpers/live-refresh-fixtures.mjs";

const detail = liveDetail(liveRecord({ kickoffAt: now + 3_600_000 }));
const { asOf, fixture: { fixtureId, kickoffAt } } = detail;
const hash = (digit) => digit.repeat(64);
const policyHash = hash("a"), receiptId = hash("b"), catalogId = hash("c");
const checkedAt = asOf - 1000;
const bet = (values, betId = 5, betName = "Goals Over/Under") => ({ betId, betName, valuesHash: oddsValuesHash(values) });
const book = (bookmakerId, bets) => ({ bookmakerId, kickoffAt, bets });
const total15 = [{ label: "Over 1.5", odd: "1.35" }, { label: "Under 1.5", odd: "3.9" }];
const secondaryQuotes = [{ label: "Over 2.5", odd: "2.0123" }];
const sealed = (body) => ({ id: body.id, validIntegrity: 1, body });
const batch = (id, kind, extras) => sealed({ id, kind, scopeKey: kind, policyHash, accountId: hash("d"), requestId: hash("e"),
  status: "complete", requestsDispatched: 1, receivedAt: checkedAt, slot: checkedAt, date: null, contractVersion: "direct-v3-odds-2026-10-10",
  reasons: [], missingCoverage: [], pages: [], fixtures: [], catalog: [], ...extras });
const snapshot = (id, bookmakerId, values, betId = 5, betName = "Goals Over/Under") => ({ ...sealed({
  id, fixtureId, bookmakerId, bookmakerName: bookmakerId === 8 ? "Primary" : "Secondary", previousId: null, ...bet(values, betId, betName),
  retrievedAt: checkedAt - 30_000, providerUpdatedAt: null, retainUntil: kickoffAt + 60_000, values,
}), fixtureId, bookmakerId, betId });

test("one sealed receipt exposes exact partial and alternate-line prices separately for each confirmed bookmaker", async () => {
  const state = { fixtureId, externalId: 11n, kickoff: new Date(kickoffAt), latestBatchId: receiptId, policyHash,
    lastRetrievedAt: new Date(checkedAt), lastProviderUpdatedAt: null };
  const catalog = batch(catalogId, "bets", { catalog: [{ id: 5, name: "Goals Over/Under" }] });
  const receipt = batch(receiptId, "prices", { pages: [{ provider: "api-football", endpoint: "odds", fromCache: false, retrievedAt: checkedAt,
    providerUpdatedAt: null, currentPage: 1, totalPages: 1, requestParameters: {}, contractVersion: "direct-v3-odds-2026-10-10" }],
    fixtures: [{ externalId: 11, observationHash: hash("f"), outcome: "apply", quoteManifest: book(8, [bet(total15)]),
      additionalQuoteManifests: [book(3, [bet(secondaryQuotes)]), book(11, [bet(total15, 6, "Wrong catalog bet")])] }] });
  const results = [[state], [catalog], [receipt], [snapshot(hash("1"), 8, total15), snapshot(hash("2"), 3, secondaryQuotes),
    snapshot(hash("3"), 11, total15, 6, "Wrong catalog bet"), snapshot(hash("4"), 7, total15)]];
  const found = await storedCurrentBookmakerQuotes({ $queryRaw: async () => results.shift() }, [{ fixtureId, kickoffAt }], asOf);
  const odds = projectBookmakerOdds(found.get(fixtureId), "pre-match");
  assert.deepEqual(odds.books.map(({ bookmakerId }) => bookmakerId), [8, 3]);
  assert.deepEqual(odds.books[0].markets[0].selections.map(({ label }) => label), ["Over 1.5", "Under 1.5"]);
  assert.equal(bookmakerMarketPrice(odds, "total-goals", "over-2.5"), "2.0123");
  assert.equal(bookmakerMarketPrice(odds, "total-goals", "under-2.5"), null);
  assert.equal(projectBookmakerOdds(found.get(fixtureId), "pre-match", 480).limited, true);
});

test("detail odds remain independent of a forecast and keep access, occurrence, and semantic-refresh checks", () => {
  const quote = { fixtureId, kickoffAt, checkedAt, primaryBookmakerId: 8, bookmakers: [
    { bookmakerId: 8, bookmakerName: "Primary", offers: [{ betId: 5, betName: "Goals Over/Under", values: total15, providerUpdatedAt: null }] },
  ] };
  const bookmakerOdds = projectBookmakerOdds(quote, "pre-match");
  const unavailableMarkets = ["match-result", "double-chance", "total-goals", "both-teams-to-score"]
    .map((family) => ({ family, reason: "not-published" }));
  const initial = matchDetailResponseSchema.parse({ ...detail, bookmakerOdds, fixture: { ...detail.fixture, forecast: null, unavailableMarkets },
    snapshot: null, currentRevisionId: null, selectedCycle: null });
  const refreshed = matchDetailResponseSchema.parse({ ...initial, asOf: asOf + 10,
    bookmakerOdds: projectBookmakerOdds({ ...quote, checkedAt: checkedAt + 10 }, "pre-match") });
  assert.strictEqual(mergeLiveDetail(initial, refreshed).bookmakerOdds, initial.bookmakerOdds);
  assert.equal(mergeLiveDetail(initial, { ...refreshed, bookmakerOdds: null }).bookmakerOdds, null);
  assert.equal(gateDetailResponse(initial, { tier: "free", signedIn: false }).bookmakerOdds, undefined);
  assert.equal(matchDetailResponseSchema.safeParse({ ...initial, bookmakerOdds: { ...bookmakerOdds, kind: "closing" } }).success, false);
});

test("the broad in-play projection displays exact verified handicap lines and withholds ambiguous and suspended selections", () => {
  const value = (label, handicap, odd, main = false, suspended = false) => ({ label, handicap, odd, main, suspended });
  const market = { id: 111, name: "Asian Handicap", values: [
    value("Home", "-1.5", "1.99", true), value("Home", "-1.5", "1.72"), value("Away", "1.5", "2.01", true, true),
    value("Away", "0.5", "1.75"), value("Home", "-0.5", "1.59"), value("Home", "-0.5", "1.6"),
  ] };
  const catalogue = reviewedInPlayCatalog([{ id: 111, name: "Asian Handicap" }, { id: 112, name: "<unsupported>" }]);
  const fixture = { finished: false, stopped: false, blocked: false, bets: [market] };
  const shown = mapInPlayOdds(fixture, catalogue, true);
  assert.equal(shown.state, "available");
  assert.deepEqual(shown.markets, []);
  assert.deepEqual(shown.providerMarkets[0].selections, [
    { label: "Away", line: "0.5", price: "1.75" }, { label: "Home", line: "-1.5", price: "1.99" },
  ]);
  assert.deepEqual(mapInPlayOdds({ ...fixture, blocked: true }, catalogue, true), { state: "suspended", markets: [] });
  assert.equal(mapInPlayOdds(fixture, {}, true).providerMarkets, undefined);
});
