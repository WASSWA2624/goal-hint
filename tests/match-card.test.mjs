import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixtureSnapshotSchema, parseFixtureSnapshot } from "../src/domain/fixture-snapshot.ts";
import { cardResultStatus, hasFinalScoreStatus, liveClockFromProvider, probabilityEntry, sameCardFixture, selectedCardPrediction, teamInitials } from "../src/domain/match-card.ts";
import { mergeFixtureObservation } from "../src/domain/fixture-reconciliation.ts";
import { marketRules, marketSelections, validateMarketGroup } from "../src/domain/markets.ts";
import { isSafeRemoteImageUrl } from "../src/domain/remote-image.ts";
import { createMessages } from "../src/i18n/messages.ts";
import { makeStore, beginFeedRequest } from "../src/state/store.ts";
import { pageReceived } from "../src/state/feed.ts";
import { bootstrap } from "./helpers/client-state-fixtures.mjs";
import { cardExamples, cardFixture } from "./helpers/match-card-fixtures.mjs";

test("selected family defaults to match result and never inherits another family's outcome or probability", () => {
  const record = cardFixture();
  assert.equal(selectedCardPrediction(record).status, "correct");
  assert.equal(selectedCardPrediction(record).probability.roundedPercent, 54);
  const goals = selectedCardPrediction(record, "total-goals");
  assert.equal(goals.status, "incorrect");
  assert.equal(goals.item.market.selection, "under-2.5");
  assert.equal(goals.probability.roundedPercent, 70);
  assert.equal(selectedCardPrediction(record, "both-teams-to-score").status, "incorrect");
  const missing = cardExamples().find(({ fixture }) => fixture.fixtureId === "card-missing-family").fixture;
  assert.equal(selectedCardPrediction(missing, "total-goals"), null);
  assert.equal(selectedCardPrediction(missing).status, "correct");
  assert.equal(selectedCardPrediction(cardFixture({ forecast: null })), null);
});

test("display never settles live or final scores or invents missing forecasts", () => {
  for (const status of ["live", "finished-regulation", "finished-extra-time", "finished-penalties"]) {
    const record = cardFixture({ status, score: { home: 20, away: 0 } }, "ai", null);
    assert.equal(selectedCardPrediction(record).status, "pending");
  }
  const premature = cardFixture(); premature.status = "live";
  assert.equal(selectedCardPrediction(premature).status, "pending");
  assert.throws(() => parseFixtureSnapshot(premature));
  assert.equal(hasFinalScoreStatus("finished-extra-time"), true);
  for (const status of ["scheduled", "live", "postponed", "awarded", "unknown"]) assert.equal(hasFinalScoreStatus(status), false);
});

test("scheduled results show Upcoming with or without a pick, without altering market settlement", () => {
  const scheduled = cardFixture({ status: "scheduled", score: null }, "ai", null);
  const prediction = selectedCardPrediction(scheduled);
  assert.equal(prediction.status, "pending");
  assert.equal(cardResultStatus(scheduled.status, prediction.status), "upcoming");
  const noPick = { ...scheduled, forecast: null };
  assert.equal(selectedCardPrediction(noPick), null);
  assert.equal(cardResultStatus(noPick.status, "unavailable"), "upcoming");
  assert.equal(createMessages().text("match.result.upcoming"), "Upcoming");
  for (const status of ["live", "finished-regulation", "finished-extra-time", "finished-penalties", "postponed", "canceled", "abandoned", "awarded", "unknown"]) {
    for (const outcome of ["pending", "correct", "incorrect", "void", "unavailable"]) {
      assert.equal(cardResultStatus(status, outcome), outcome, `${status}: ${outcome}`);
    }
  }
});

test("outcome bindings require the same cycle, revision and selected pick, with a retained void reason", () => {
  for (const [key, value] of [["cycleId", "older-cycle"], ["revisionId", "older-revision"], ["selection", "away-win"]]) {
    const record = cardFixture(); record.forecast.markets[0].outcome[key] = value;
    assert.equal(fixtureSnapshotSchema.safeParse(record).success, false);
    assert.equal(selectedCardPrediction(record).status, "pending");
  }
  const record = cardFixture({}, "ai", "void");
  assert.match(selectedCardPrediction(record).explanation, /Postponed/);
  record.forecast.markets[0].outcome.explanation = null;
  assert.throws(() => parseFixtureSnapshot(record));
});

test("all outcomes, both sources and independent coverage facts have deterministic fixtures", () => {
  const examples = cardExamples();
  const outcomes = new Set(examples.map(({ fixture, selectedFamily }) => selectedCardPrediction(fixture, selectedFamily)?.status ?? "unavailable"));
  assert.deepEqual([...outcomes].sort(), ["correct", "incorrect", "pending", "unavailable", "void"]);
  assert.equal(selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-partial").fixture).item.market.source, "api-football");
  const limited = selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-limited").fixture);
  assert.equal(limited.item.limitedNews, true);
  assert.equal(limited.updateDelayed, false);
  const delayed = selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-delayed").fixture);
  assert.equal(delayed.updateDelayed, true);
  assert.equal(delayed.provisional, true);
  assert.equal(delayed.publishedAt, selectedCardPrediction(cardFixture()).publishedAt);
});

test("probability labels use shared group allocation and boundary keys, with no certainty claim", () => {
  const equal = validateMarketGroup("match-result", { source: "ai", period: marketRules.period,
    probabilities: { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 } }).markets[0];
  assert.deepEqual(["home-win", "draw", "away-win"].map((selection) => probabilityEntry(equal, selection).roundedPercent), [34, 33, 33]);
  const boundary = validateMarketGroup("total-goals", { source: "api-football", period: marketRules.period, line: 2.5,
    probabilities: { "over-2.5": 0.001, "under-2.5": 0.999 } }).markets[0];
  const messages = createMessages();
  assert.equal(messages.text(probabilityEntry(boundary, "over-2.5").labelKey), "Less than 1%");
  assert.equal(messages.text(probabilityEntry(boundary).labelKey), "More than 99%");
  assert.throws(() => probabilityEntry(boundary, "draw"));
});

test("decorative initials handle unknown, Unicode and unbroken names within two code points", () => {
  for (const [name, expected] of [[null, "?"], ["  ", "?"], ["⚽", "?"], ["United", "UN"], ["Example Home FC", "EF"],
    ["Côte d’Ivoire", "CI"], ["e\u0301", "É"], ["皇家马德里", "皇家"], ["ß ß", "SS"]]) {
    assert.equal(teamInitials(name), expected);
    assert.ok([...teamInitials(name)].length <= 2);
  }
});

test("shared image URL safety rejects credentials, query tokens, fragments, whitespace and non-HTTPS sources", () => {
  assert.equal(isSafeRemoteImageUrl("https://media.example.test/team.svg"), true);
  for (const value of [null, undefined, "", "/team.svg", "//media.example.test/a.svg", "http://media.example.test/a.svg", "data:image/png;base64,abc",
    "https://user:secret@media.example.test/a.svg", "https://media.example.test/a.svg?key=secret", "https://media.example.test/a.svg#token",
    " https://media.example.test/a.svg", "https://media.example.test/a\nb.svg", "https://media.example.test\\a.svg", `https://media.example.test/${"a".repeat(2048)}`]) {
    assert.equal(isSafeRemoteImageUrl(value), false);
  }
  const record = cardFixture(); record.homeTeam.logoUrl = "https://user:secret@media.example.test/a.svg";
  assert.throws(() => parseFixtureSnapshot(record));
});

test("publication display uses the actual EAT date/time and interpolation treats names as literal text", () => {
  const messages = createMessages("fr");
  const selected = selectedCardPrediction(cardFixture());
  assert.match(messages.reportingInstant(selected.publishedAt), /Oct 9, 2026, 00:18 EAT/);
  assert.equal(messages.text("match.title", { home: "{away}", away: "Example Away" }), "{away} v Example Away");
});

test("new presentation metadata participates in whole-fixture version reconciliation", () => {
  const initial = cardFixture();
  const store = makeStore({ ...bootstrap(), data: { records: [initial], page: 1, nextPage: null } });
  const next = cardFixture({ dataVersion: "10", homeTeam: { ...initial.homeTeam, logoUrl: null } }, "api-football", null);
  next.partialCoverage = true; next.forecast.updateDelayed = true;
  let request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request, data: { records: [next], page: 1, nextPage: null } }));
  assert.deepEqual(store.getState().feed.records[initial.fixtureId], next);
  request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request, data: { records: [initial], page: 1, nextPage: null } }));
  const accepted = store.getState().feed.records[initial.fixtureId];
  assert.equal(accepted.homeTeam.logoUrl, null);
  assert.equal(selectedCardPrediction(accepted).status, "pending");
  assert.equal(selectedCardPrediction(accepted).item.market.source, "api-football");
  assert.equal(accepted.partialCoverage, true);
});

test("memoized cards notice every observation field an equal-version refresh can change", () => {
  const previous = cardFixture({ update: { prediction: "current", result: "current" }, availabilityMessage: null });
  const merge = (change) => { const next = structuredClone(previous); change(next); return mergeFixtureObservation(previous, next); };
  assert.equal(sameCardFixture(previous, merge((next) => { next.syncedAt = (next.syncedAt ?? 0) + 1000; })), true);
  for (const change of [(next) => { next.partialCoverage = !next.partialCoverage; }, (next) => { next.availabilityMessage = "Window closed"; },
    (next) => { next.update.prediction = "updating"; }, (next) => { next.update.result = "delayed"; },
    (next) => { next.forecast.updateDelayed = !next.forecast.updateDelayed; }]) {
    assert.equal(sameCardFixture(previous, merge(change)), false);
  }
  assert.equal(sameCardFixture(previous, { ...previous, dataVersion: "99" }), false);
});

test("live clock maps provider phases, hides paused minutes and requires a live fixture", () => {
  assert.deepEqual(liveClockFromProvider("2H", 67), { phase: "second-half", minute: 67 });
  assert.deepEqual(liveClockFromProvider("1H", 0), { phase: "first-half", minute: 0 });
  assert.deepEqual(liveClockFromProvider("ET", 104), { phase: "extra-time", minute: 104 });
  assert.deepEqual(liveClockFromProvider("HT", 45), { phase: "half-time", minute: null });
  assert.deepEqual(liveClockFromProvider("P", 120), { phase: "penalties", minute: null });
  assert.deepEqual(liveClockFromProvider("SUSP", 70), { phase: "suspended", minute: null });
  assert.deepEqual(liveClockFromProvider(null, 12), { phase: "in-play", minute: 12 });
  assert.deepEqual(liveClockFromProvider("toString", 12), { phase: "in-play", minute: 12 });
  for (const elapsed of [null, -1, 201, 1.5]) assert.equal(liveClockFromProvider("2H", elapsed).minute, null);
  const live = cardFixture({ fixtureId: "card-live", status: "live", score: { home: 1, away: 1 }, liveClock: { phase: "second-half", minute: 58 } }, "ai", null);
  assert.deepEqual(live.liveClock, { phase: "second-half", minute: 58 });
  assert.equal(parseFixtureSnapshot({ ...live, liveClock: undefined }).liveClock, undefined);
  assert.throws(() => parseFixtureSnapshot({ ...live, status: "scheduled", score: null }));
  assert.throws(() => parseFixtureSnapshot({ ...live, liveClock: { phase: "second-half", minute: 58, stoppage: 2 } }));
  assert.throws(() => parseFixtureSnapshot({ ...live, liveClock: { phase: "overtime", minute: 58 } }));
});

test("compact kickoff parts use the EAT reporting zone regardless of the visitor clock", () => {
  const messages = createMessages();
  const kickoff = Date.UTC(2026, 9, 16, 18, 0);
  assert.equal(messages.reportingTime(kickoff), "21:00");
  assert.equal(messages.reportingDay(kickoff), "Fri, Oct 16");
  assert.equal(messages.reportingTime(Date.UTC(2026, 9, 16, 21, 30)), "00:30");
  assert.equal(messages.reportingDay(Date.UTC(2026, 9, 16, 21, 30)), "Sat, Oct 17");
});

test("every family and selection has a full generic prediction label", () => {
  const messages = createMessages();
  for (const [family, selections] of Object.entries(marketSelections)) {
    assert.notEqual(messages.text(`market.family.${family}`), `market.family.${family}`);
    for (const selection of selections) {
      const pick = messages.text(`market.pick.${selection}`);
      assert.equal(pick, messages.text(`market.selection.${selection}`), selection);
      assert.doesNotMatch(pick, /^(?:1|2|X|1X|X1|X2|2X|12|21|Over|Under)$/u, selection);
    }
  }
});

const cardSource = readFile(new URL("../src/components/match/match-card.tsx", import.meta.url), "utf8");

test("every no-pick reason has visitor text for the card's hidden label", () => {
  const messages = createMessages();
  for (const reason of ["market", "outside", "updating", "unselected", "closed", "failed", "awaiting"]) {
    assert.notEqual(messages.text(`match.noPickReason.${reason}`), `match.noPickReason.${reason}`);
  }
});

test("cards show full team names, never abbreviations or provider team codes", async () => {
  // Owner decision: the phone card's teams line and the table both render the full name (on tiles a long name wraps
  // onto a second line; only beyond two lines is it clamped with an ellipsis and a full-name tooltip).
  const source = await cardSource;
  assert.doesNotMatch(source, /domain\/team-name|[tT]eamAbbreviations?\b|validTeamCode|[Tt]eam\.code\b|shortTeamName|teamDisplayCandidates/u);
  assert.match(source, /<TeamName data-team-name=""[^>]*>\{name\}<\/TeamName>/u);
});

/** One styled component's template from the card source, and the part of it inside its `${tile} {` block. */
async function styledBlock(name) {
  const match = (await cardSource).match(new RegExp(`const ${name} = styled(?:\\.[a-z]+|\\([A-Za-z]+\\))(?:<[^>]*>)?\`([^\`]*)\`;`, "u"));
  assert.ok(match, `${name} styles`);
  const tileStart = match[1].indexOf("${tile} {");
  assert.ok(tileStart >= 0, `${name} has tile rules`);
  return { all: match[1], tile: match[1].slice(tileStart) };
}

test("the phone tile puts one fixed-width result tag beside the meta line, outside the desktop pick subgrid", async () => {
  const card = (await styledBlock("Card")).tile.split("${table}")[0];
  assert.match(card, /grid-template-areas: "meta result" "teams teams" "pick pick";/u);
  const result = await styledBlock("Result");
  assert.match(result.tile.split("${table}")[0], /grid-area: result;/u);
  // Owner decision (2026-10-25): Upcoming, Pending, Win, Loss and Void tags all share one width on phones.
  assert.match(result.tile.split("${table}")[0], /inline-size: 5\.25rem;/u);
  assert.doesNotMatch(result.tile.split("${table}")[0], /min-inline-size/u);
  // Bright verdict colours apply on both layouts; Upcoming has its own pale tag.
  assert.match(result.all, /theme\.color\.verdict\[/u);
  assert.match(result.all, /&\[data-result-badge="upcoming"\] \{\s*color: \$\{\(\{ theme \}\) => theme\.color\.verdict\.upcoming\.text\}/u);
  assert.match(result.tile, /&\[data-result-badge="unavailable"\] \{ display: none; \}/u);
  // The table keeps the result in its own column, right after the three pick columns.
  assert.match(result.tile, /\$\{table\} \{\s*grid-column: 10;\s*grid-row: 2;/u);
  assert.match((await styledBlock("Pick")).tile, /grid-column: 7 \/ span 3;/u);
  assert.match(await cardSource, /<\/Pick>\s*<Result aria-hidden="true"/u);
});

test("the phone pick panel shows the market icon, market over pick, and the odds and chance in a box", async () => {
  // Owner decision (2026-10-25): design 09 "Pick Panel" replaces the one-line pick.
  const pick = (await styledBlock("Pick")).tile.split("${table}")[0];
  assert.match(pick, /grid-template-areas: "glyph market numbers" "glyph pick numbers";/u);
  assert.match(pick, /background: \$\{\(\{ \$family \}\) => light\.market\[\$family\]\.soft\};/u);
  // A locked pick adds the subscribe line across the panel.
  assert.match(pick, /&\[data-pick-state="subscriber"\] \{\s*grid-template-areas: "glyph market numbers" "glyph pick numbers" "hint hint hint";/u);
  assert.match((await styledBlock("CardGlyph")).tile, /grid-area: glyph;/u);
  assert.match((await styledBlock("MarketName")).tile, /grid-area: market;/u);
  assert.match((await styledBlock("PickShort")).tile, /grid-area: pick;/u);
  assert.match((await styledBlock("GatedPick")).tile, /grid-area: pick;/u);
  assert.match((await styledBlock("PickNumbers")).tile, /grid-area: numbers;/u);
  assert.match((await styledBlock("SubscribeHint")).tile, /grid-area: hint;/u);
  // The market and pick shorten with an ellipsis, so the numbers box always stays whole.
  for (const name of ["MarketName", "PickShort"]) assert.match((await styledBlock(name)).tile, /\$\{ellipsis\}/u);
  // The numbers box replaces the desktop probability cell on phones.
  assert.match((await styledBlock("Probability")).tile, /\$\{tile\} \{ display: none; \}/u);
  const messages = createMessages();
  assert.deepEqual(["match.likely", "match.chance", "details.odds", "match.subscribeToSee"].map((key) => messages.text(key)),
    ["likely", "chance", "Odds", "Subscribe to see the prediction"]);
});

test("phone tiles keep design 09's light palette and strong frame in both themes", async () => {
  // Owner decision (2026-10-25): white cards on a dark page too; only the desktop table follows the theme.
  const source = await cardSource;
  assert.match(source, /const light = lightTheme\.color;/u);
  const card = (await styledBlock("Card")).tile.split("${table}")[0];
  assert.match(card, /color: \$\{light\.text\};\s*background: \$\{light\.surface\};/u);
  assert.match(card, /solid \$\{phoneCardFrame\.border\};/u);
  // The list item draws the shadow, because its content-visibility clips anything a card paints outside it.
  const list = await readFile(new URL("../src/components/match/match-card-list.tsx", import.meta.url), "utf8");
  assert.match(list, /> li:has\(> article:only-child\) \{ border-radius: \$\{phoneCardFrame\.radius\}; box-shadow: \$\{phoneCardFrame\.shadow\}; \}/u);
  assert.doesNotMatch(card, /box-shadow/u);
});

test("enlarged text wraps the phone kickoff under the league instead of under the result tag", async () => {
  const source = await cardSource;
  assert.match((await styledBlock("Card")).tile, /container: match-card \/ inline-size;/u);
  assert.match(source, /const narrowTile = "@container match-card \(max-width: 18rem\)";/u);
  // A long league shortens first; on a narrow tile the kickoff wraps under it and the dot between them is dropped.
  assert.match((await styledBlock("Meta")).tile, /\$\{narrowTile\} \{ flex-wrap: wrap; \}/u);
  assert.match((await styledBlock("MetaDot")).tile, /\$\{narrowTile\} \{ display: none; \}/u);
});

test("long team names stay on one line with full-name tooltip and accessible labels", async () => {
  const styles = await styledBlock("TeamName");
  const tile = styles.tile.split("${table}")[0];
  assert.match(tile, /white-space: nowrap;/u);
  assert.doesNotMatch(tile, /-webkit-line-clamp|text-wrap: balance|white-space: normal/u);
  assert.match(await cardSource, /<TeamName data-team-name="" title=\{name\}>/u);
});

test("hovering any ellipsized text shows its full value, even under the full-card link", async () => {
  const source = await readFile(new URL("../src/components/ui/truncation-tooltips.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /element\.scrollWidth - element\.clientWidth > 1 && getComputedStyle\(element\)\.textOverflow === "ellipsis"/u);
  // The link overlay is the hovered element, so the text is found beneath it and the tooltip goes on the overlay.
  assert.match(source, /document\.elementsFromPoint\(pointer\.x, pointer\.y\)/u);
  assert.match(source, /label\.getAttribute\("title"\)\?\.trim\(\) \|\| label\.innerText\.trim\(\)/u);
  assert.match(source, /event\.pointerType === "touch"/u);
  assert.match(layout, /<TruncationTooltips \/>/u);
  // The country label keeps its full name as the title behind its one-line short form.
  assert.match(await cardSource, /<CountryName data-country-name title=\{countryName \|\| undefined\}>\{countryShortName\(country\) \|\| "–"\}<\/CountryName>/u);
});
