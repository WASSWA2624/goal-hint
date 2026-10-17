import assert from "node:assert/strict";
import test from "node:test";
import { footballSearchScore, normalizeFootballSearch, prepareFootballSearch } from "../src/domain/football-search.ts";

test("misspellings, established abbreviations and reordered words find Manchester United", () => {
  for (const query of ["Machester United", "Man United", "United Manchester", "Mankheste Unitited", "Man Utd", "M.U.F.C.", "manutd", "Man Utd FC"]) {
    assert.ok(footballSearchScore(query, "Manchester United") > 0, query);
    assert.equal(footballSearchScore(query, "Manchester City"), 0, query);
    assert.equal(footballSearchScore(query, "Leeds United"), 0, query);
  }
});

test("exact names precede aliases, reordered words, prefixes and bounded spelling matches", () => {
  const query = prepareFootballSearch("Manchester United");
  const candidates = ["Manchester Unitid", "United Manchester", "Manchester United Women", "Manchester Utd", "Manchester United"];
  const ordered = candidates.map((name, index) => ({ name, index, score: query.score(name) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  assert.deepEqual(ordered.map(({ name }) => name), ["Manchester United", "Manchester Utd", "United Manchester", "Manchester United Women", "Manchester Unitid"]);
  assert.equal(query.score("Manchester United"), 1000);
  assert.ok(footballSearchScore("Manch United", "Manchester United") > footballSearchScore("Mankheste Unitited", "Manchester United"));
});

test("case, accents, punctuation and international names normalize without erasing non-Latin scripts", () => {
  assert.equal(normalizeFootballSearch("  SÃO—PAULO!  "), "sao paulo");
  for (const [query, candidate] of [["sao paulo", "São Paulo"], ["KOLN", "Köln"], ["Strasse", "Straße"],
    ["St. Étienne", "Saint-Etienne"], ["O Higgins", "O-Higgins"], ["OHiggins", "O’Higgins"],
    ["U.S.A.", "United States"], ["Dynamo Kyiv", "Dynamo-Kyiv"], ["東京ヴェルディ", "東京ヴェルディ"],
    ["Москва Динамо", "Динамо Москва"], ["Paris Saint Germain", "Paris Saint-Germain"]]) {
    assert.ok(footballSearchScore(query, candidate) > 0, `${query}: ${candidate}`);
  }
  assert.equal(footballSearchScore("東京ヴェルディ", "Manchester United"), 0);
});

test("team, competition and country aliases share the same scorer", () => {
  for (const [query, candidate] of [["PSG", "Paris Saint Germain"], ["Spurs", "Tottenham Hotspur"],
    ["BVB", "Borussia Dortmund"], ["Wolves", "Wolverhampton Wanderers"], ["Barça", "Barcelona"],
    ["Bayern Munich", "Bayern München"], ["Inter Milan", "Internazionale"], ["EPL", "Premier League"],
    ["UCL", "UEFA Champions League"], ["USA", "United States of America"], ["UAE", "United Arab Emirates"],
    ["Côte d’Ivoire", "Ivory Coast"], ["Czech Republic", "Czechia"], ["Türkiye", "Turkey"]]) {
    assert.ok(footballSearchScore(query, candidate) >= 940, `${query}: ${candidate}`);
    assert.ok(footballSearchScore(candidate, query) >= 940, `${candidate}: ${query}`);
  }
});

test("word prefixes, adjacent transpositions and full names work across identity types", () => {
  for (const [query, candidate] of [["prem leag", "Premier League"], ["Champions Leauge", "UEFA Champions League"],
    ["Ugnada", "Uganda"], ["Fuhlam", "Fulham"], ["Manchster United", "Manchester United"],
    ["ManchesterUnited", "Manchester United"], ["Man chester United", "Manchester United"],
    ["Barcelona", "FC Barcelona"], ["UEFA CL", "UEFA Champions League"]]) {
    assert.ok(footballSearchScore(query, candidate) > 0, `${query}: ${candidate}`);
  }
});

test("meaningful literal word fragments retain substring search below prefix relevance", () => {
  assert.ok(footballSearchScore("chester United", "Manchester United") > 0);
  assert.ok(footballSearchScore("nited", "United") > 0);
  assert.ok(footballSearchScore("club", "Synthetic SuperClub") > 0);
  assert.ok(footballSearchScore("nited", "Nited United") > footballSearchScore("nited", "United"));
  assert.ok(footballSearchScore("chester", "Chesterfield") > footballSearchScore("chester", "Manchester"));
  for (const [query, candidate] of [["he", "Manchester"], ["ite", "UnitedStatesOfAmerica"], ["%_!", "Manchester United"],
    ["39", "Club 3901"], ["901", "3901"], ["U21", "SuperU21"], ["chester Arsenal", "Manchester United"]]) {
    assert.equal(footballSearchScore(query, candidate), 0, `${query}: ${candidate}`);
  }
});

test("short queries, numeric identifiers and missing substantive words remain precise", () => {
  for (const [query, candidate] of [["ma", "Manchester United"], ["man", "Milan"], ["MU", "Manchester United"],
    ["3901", "3902"], ["U21", "U23"], ["League 1", "League 2"], ["United Zimbabwe", "Manchester United"],
    ["Manchester Arsenal", "Manchester United"], ["Chelsea", "Manchester United"], ["Mankheste Unitited", "Leeds United"],
    ["Barcelona Madrid", "Barcelona"], ["Zzzzzzz", "Zimbabwe"], ["39", "Club 3901"]]) {
    assert.equal(footballSearchScore(query, candidate), 0, `${query}: ${candidate}`);
  }
  assert.ok(footballSearchScore("man", "Manchester United") > 0);
  assert.equal(footballSearchScore("3901", "3901"), 1000);
  assert.equal(footballSearchScore("Li", "Li"), 1000);
});

test("club-word-only queries retain literal matches without accepting spelling alternatives", () => {
  assert.deepEqual(prepareFootballSearch("club").tokens, ["club"]);
  assert.ok(footballSearchScore("club", "Synthetic Club 3901") > 0);
  assert.ok(footballSearchScore("FC", "FC Barcelona") > 0);
  assert.ok(footballSearchScore("club", "Clubhouse United") > 0);
  assert.equal(footballSearchScore("club", "Clue United"), 0);
  assert.equal(footballSearchScore("FC", "AC Barcelona"), 0);
});

test("the exact senior team outranks its age-group counterpart for every requested query", () => {
  for (const query of ["Manchester United", "Machester United", "Man United", "United Manchester", "Mankheste Unitited"]) {
    const search = prepareFootballSearch(query);
    assert.ok(search.score("Manchester United U21") > 0, query);
    assert.ok(search.score("Manchester United") > search.score("Manchester United U21"), query);
    assert.equal(search.score("Newcastle United"), 0, query);
    assert.equal(search.score("Manchester City"), 0, query);
  }
});

test("distinct query words cannot reuse a single candidate word, and repeated words do not inflate relevance", () => {
  assert.equal(footballSearchScore("Manch Manchester", "Manchester United"), 0);
  const repeated = footballSearchScore("Manchester United United", "Manchester United");
  assert.ok(repeated > 0 && repeated <= footballSearchScore("Manchester United", "Manchester United"));
  assert.ok(footballSearchScore("man manc", "Manchester Mancini") > 0);
  assert.ok(footballSearchScore("aaaaaaaaaa bbaaaaaaaa bbbbaaaaaa bbbbbbaaaa",
    "aaaaaaaaaa bbaaaaaaaa bbbbaaaaaa aaaaaaaabb") > 0, "a complete spelling assignment beats an incomplete exact assignment");
});

test("empty, punctuation-only and excessive inputs reject candidates without wildcard behavior", () => {
  for (const query of ["", "  ", "%_!", "---", "x".repeat(513)]) {
    assert.equal(footballSearchScore(query, "Manchester United"), 0, query.slice(0, 20));
  }
  assert.equal(footballSearchScore("Manchester United", ""), 0);
  assert.equal(footballSearchScore("Manchester United", "x".repeat(513)), 0);
  for (const value of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    assert.equal(footballSearchScore(value, "Manchester United"), 0, value);
  }
});

test("prepared scorers are immutable, deterministic and independent across searches", () => {
  const united = prepareFootballSearch("Man United"), city = prepareFootballSearch("Man City");
  assert.ok(Object.isFrozen(united));
  assert.ok(Object.isFrozen(united.tokens));
  assert.equal(united.normalized, "man united");
  assert.deepEqual(united.tokens, ["manchester", "united"]);
  const expected = united.score("Manchester United");
  for (let index = 0; index < 300; index++) united.score(`Unrelated ${index}`);
  assert.equal(united.score("Manchester United"), expected);
  assert.equal(united.score("Manchester City"), 0);
  assert.equal(city.score("Manchester United"), 0);
  assert.ok(city.score("Manchester City") > 0);
});
