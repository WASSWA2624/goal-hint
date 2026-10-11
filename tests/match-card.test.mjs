import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixtureSnapshotSchema, parseFixtureSnapshot } from "../src/domain/fixture-snapshot.ts";
import { hasFinalScoreStatus, liveClockFromProvider, probabilityEntry, sameCardFixture, selectedCardPrediction, teamInitials } from "../src/domain/match-card.ts";
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

test("all outcomes, both sources and independent coverage notices have deterministic fixtures", () => {
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

test("phone chips have a short market code and pick for every family and selection", () => {
  const messages = createMessages();
  for (const [family, selections] of Object.entries(marketSelections)) {
    const code = messages.text(`market.code.${family}`);
    assert.ok(code !== `market.code.${family}` && code.length <= 7, `${family}: ${code}`);
    for (const selection of selections) {
      const pick = messages.text(`market.pick.${selection}`);
      assert.ok(pick !== `market.pick.${selection}` && pick.length <= 5, `${selection}: ${pick}`);
    }
  }
});

/** Manrope advance widths in em (assets/brand/source/fonts/Manrope-wght.ttf instanced at wght 700 for the market and
 * pick chips and 800 for the probability chip), with the kerning pairs that occur in those labels. */
const manrope = {
  700: { adv: { 1: 0.438, 2: 0.5955, 5: 0.586, " ": 0.2, ".": 0.3035, "/": 0.433, B: 0.631, C: 0.7385, D: 0.7005, N: 0.718,
    O: 0.7495, S: 0.6575, T: 0.6065, U: 0.72, X: 0.6555, Y: 0.6115, d: 0.617, e: 0.602, n: 0.6255, o: 0.618, r: 0.399, s: 0.5415,
    v: 0.553 }, kern: { BT: -0.02, TT: 0.06, nd: -0.0085, Ye: -0.08 } },
  800: { adv: { 0: 0.674, 1: 0.454, 2: 0.604, 3: 0.591, 4: 0.615, 5: 0.589, 6: 0.622, 7: 0.544, 8: 0.623, 9: 0.622, "%": 0.9,
    "<": 0.645, ">": 0.645 }, kern: { 24: -0.02, 44: -0.02, 49: -0.03, 52: -0.025, 61: -0.015, 69: -0.03, 74: -0.04 } },
};
function em(text, weight) {
  const { adv, kern } = manrope[weight], characters = [...text];
  return characters.reduce((width, character, index) => {
    assert.ok(Object.hasOwn(adv, character), `${JSON.stringify(character)} has a measured advance`);
    const pair = index + 1 < characters.length ? character + characters[index + 1] : "";
    return width + adv[character] + (kern[pair] ?? 0);
  }, 0);
}
const cardSource = readFile(new URL("../src/components/match/match-card.tsx", import.meta.url), "utf8");
async function chipSlotEm(name) {
  const match = (await cardSource).match(new RegExp(`\\b${name}: "calc\\(([\\d.]+)em`, "u"));
  assert.ok(match, `chip slot ${name}`);
  return Number(match[1]);
}

test("every market code, pick and two-digit probability fits its phone chip slot, so chips align down the list", async () => {
  // Slots are in em of each chip's type (docs/match-card.md): wider content only widens its own chip, never clips.
  const messages = createMessages();
  const [market, shortMarket, pick, probability] = await Promise.all(["market", "shortMarket", "pick", "probability"].map(chipSlotEm));
  for (const [family, selections] of Object.entries(marketSelections)) {
    const code = messages.text(`market.code.${family}`);
    assert.ok(em(code, 700) <= market, `${code}: ${em(code, 700)}em`);
    assert.ok(em(code.split(" ")[0], 700) <= shortMarket, `${code} below 360px`);
    for (const selection of selections) {
      const text = messages.text(`market.pick.${selection}`);
      assert.ok(em(text, 700) <= pick, `${text}: ${em(text, 700)}em`);
    }
  }
  for (let value = 1; value <= 99; value += 1) {
    const text = messages.text("probability.percent", { percent: messages.number(value) });
    assert.ok(em(text, 800) <= probability, `${text}: ${em(text, 800)}em`);
  }
  assert.ok(em(messages.text("probability.compact.more-than-ninety-nine"), 800) > probability);
});

test("below 360px the market code hides only the goal line after its last space", () => {
  // The card wraps the part after the last space so 320–359px phones can show "O/U"; the product offers one line.
  const messages = createMessages();
  for (const family of Object.keys(marketSelections)) {
    const code = messages.text(`market.code.${family}`), split = code.lastIndexOf(" ");
    if (family === "total-goals") assert.equal(code.slice(split + 1), String(marketRules.totalGoalsLine));
    else assert.equal(split, -1, code);
  }
});

test("meta-line states stay short enough to follow a flag and country code on a 320px card", () => {
  // At 320px the meta line has 151.6px beside the chips; the flag, "KUW" and both dots take 62.0px and "Postp.", the
  // widest state, 34.2px at 11px bold, leaving 55.5px for the league name (docs/match-card.md).
  const messages = createMessages();
  const keys = ["match.clockShort.first-half", "match.clockShort.second-half", "match.clockShort.extra-time", "match.clockShort.penalties",
    "match.clockShort.interrupted", "match.clockShort.suspended", "match.statusShort.postponed", "match.statusShort.canceled",
    "match.statusShort.abandoned", "match.statusShort.awarded", "match.kickoffShort", "match.clock.half-time", "match.clock.break",
    "match.liveBadge", "match.final.finished-regulation", "match.final.finished-extra-time", "match.final.finished-penalties"];
  for (const key of keys) {
    const text = messages.text(key);
    assert.ok(text !== key && text.length <= 6, `${key}: ${text}`);
  }
  assert.equal(messages.text("match.clock.minute", { minute: "120" }).length, 4);
});

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
  const match = (await cardSource).match(new RegExp(`const ${name} = styled\\.[a-z]+(?:<[^>]*>)?\`([^\`]*)\`;`, "u"));
  assert.ok(match, `${name} styles`);
  const tileStart = match[1].indexOf("${tile} {");
  assert.ok(tileStart >= 0, `${name} has tile rules`);
  return { all: match[1], tile: match[1].slice(tileStart) };
}

test("long tile team names wrap at word boundaries, balanced, and clamp only beyond two lines", async () => {
  // Owner: "Though we are opting for A, long team names, should wrap". `break-word` (not the inherited `anywhere`) keeps
  // breaks at spaces unless one word alone is wider than the box; each side keeps its alignment on both lines.
  const { tile } = await styledBlock("TeamName");
  for (const rule of [/white-space: normal;/u, /overflow-wrap: break-word;/u, /text-wrap: balance;/u, /display: -webkit-box;/u,
    /-webkit-box-orient: vertical;/u, /-webkit-line-clamp: 2;/u, /line-height: 1\.2;/u, /text-align: end;/u,
    /\[data-team-side="away"\] > & \{[^}]*text-align: start;/u]) {
    assert.match(tile, rule);
  }
  assert.doesNotMatch(tile, /white-space: nowrap|overflow-wrap: anywhere/u);
  // The tooltip names both teams only when a name is clamped, measured vertically now that names wrap.
  assert.match(await cardSource, /name\.scrollHeight - name\.clientHeight > 1/u);
});

test("tile height stays 57px while names fit one line and grows by one name line when a name wraps", async () => {
  const source = await cardSource, theme = await readFile(new URL("../src/styles/theme.ts", import.meta.url), "utf8");
  const card = await styledBlock("Card"), teams = await styledBlock("Teams"), name = await styledBlock("TeamName");
  assert.match(card.tile, /gap: 5px 6px;[\s\S]*padding: 7px 9px;/u);
  assert.match(teams.tile, /--gh-logo-size: 1\.125rem;/u);
  assert.match(source, /const chip = css`[^`]*block-size: 1\.125rem;/u);
  assert.match(name.tile, /font-size: \$\{\(\{ theme \}\) => theme\.typography\.scale\.body\};/u);
  assert.match(theme, /scale: \{[^}]*body: "0\.8125rem"/u);
  const border = 1, padBlock = 7, rowGap = 5, chips = 18, crest = 18, line = 13 * 1.2;
  const height = (nameLines) => 2 * border + 2 * padBlock + chips + rowGap + Math.max(crest, nameLines * line);
  assert.ok(line <= crest, "one name line sits inside the crest row");
  assert.equal(height(1), 57);
  assert.ok(height(1) <= 61);
  assert.ok(Math.abs(height(2) - 70.2) < 1e-9 && height(2) >= 68 && height(2) <= 74, `${height(2)}px with a wrapped name`);
});

/** Manrope wght 600 advances in em (13px semibold team names), with the kerning pairs in the sample names below. */
const manrope600 = {
  adv: { " ": 0.2, "&": 0.6625, A: 0.6585, B: 0.625, D: 0.6905, G: 0.723, H: 0.7095, J: 0.4885, M: 0.8505, P: 0.627, S: 0.6435,
    U: 0.714, W: 0.9625, a: 0.5695, b: 0.608, c: 0.5685, d: 0.6085, e: 0.5965, g: 0.608, h: 0.615, i: 0.2645, l: 0.2645, m: 0.882,
    n: 0.615, o: 0.6095, p: 0.608, r: 0.3865, s: 0.536, t: 0.4225, u: 0.615, v: 0.538 },
  kern: { nc: -0.0065, te: -0.025, Pa: -0.0165, Wo: -0.06, ve: -0.02, to: -0.025, Wa: -0.045, nd: -0.0065, re: -0.01, rs: -0.02,
    ov: -0.02, At: -0.02, co: -0.015, tc: -0.025, ca: -0.0065 },
};
const nameWidth = (text) => 13 * [...text].reduce((width, character, index, characters) => {
  assert.ok(Object.hasOwn(manrope600.adv, character), `${JSON.stringify(character)} has a measured advance`);
  return width + manrope600.adv[character] + (manrope600.kern[character + (characters[index + 1] ?? "")] ?? 0);
}, 0);
/** Greedy lines at spaces (text-wrap: balance keeps the greedy line count; a trailing space hangs). */
function nameLines(name, box) {
  const lines = [];
  for (const word of name.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && nameWidth(`${last} ${word}`) <= box) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

test("at 360px well-known long names wrap onto two lines at spaces instead of being cut", () => {
  // 360px viewport: 328px card (16px list gutters), 308px content; each name box is (308 − 2 × 18 crests − 34 centre
  // − 2 × 2 centre margins) / 2 − 4px padding = 113px (docs/match-card.md).
  const box = (360 - 32 - 2 * 1 - 2 * 9 - 2 * 18 - 34 - 2 * 2) / 2 - 4;
  assert.equal(box, 113);
  assert.deepEqual(nameLines("Atletico Madrid", box), ["Atletico Madrid"], "a common name stays on one line");
  for (const [name, expected] of [["Borussia Dortmund", ["Borussia", "Dortmund"]], ["Manchester United", ["Manchester", "United"]],
    ["Paris Saint Germain", ["Paris Saint", "Germain"]],
    ["Wolverhampton Wanderers", ["Wolverhampton", "Wanderers"]], ["Brighton & Hove Albion", ["Brighton & Hove", "Albion"]],
    // The longest name on stored fixtures (11 October 2026).
    ["San Juan Atletico de Montcada", ["San Juan Atletico", "de Montcada"]]]) {
    const lines = nameLines(name, box);
    assert.deepEqual(lines, expected, name);
    for (const line of lines) assert.ok(nameWidth(line) <= box, `${line}: ${nameWidth(line).toFixed(1)}px`);
  }
});
